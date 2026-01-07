import { app, BrowserWindow, BrowserView, ipcMain, session, Menu, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { AuthService } from '../core/auth';
import { DockerManager, getDockerManager, type SandboxInstance } from '../core/docker-manager';
import { SandboxApiClient, createSandboxClient } from '../core/sandbox-api';
import { TrayManager } from '../core/tray-manager';
import { getExternalBrowserManager } from '../core/external-browser-manager';
import { browserDetector } from '../core/browser-detector';
import { shortcutManager, ShortcutLocation } from '../core/shortcut-manager';
import { settingsService } from '../core/settings';

// Enable Chrome DevTools Protocol for Playwright MCP integration
// Bound to all interfaces to allow Docker container access via host.docker.internal
// Security: Only listens on local network, not exposed to internet
app.commandLine.appendSwitch('remote-debugging-port', '9222');
app.commandLine.appendSwitch('remote-debugging-address', '0.0.0.0');

/**
 * Ensure Playwright MCP is configured in the global Codex config.
 * - Adds the playwright MCP server entry if not present
 * - Updates CDP endpoint to native localhost (127.0.0.1) if currently set to Docker endpoint
 * - Adds startup_timeout_sec if missing from existing playwright config
 * Does NOT remove other MCPs - we use the prompt to guide Codex to use Playwright.
 */
function ensurePlaywrightMcpConfig(): void {
    const codexConfigDir = path.join(os.homedir(), '.codex');
    const codexConfigPath = path.join(codexConfigDir, 'config.toml');

    // Ensure .codex directory exists
    if (!fs.existsSync(codexConfigDir)) {
        fs.mkdirSync(codexConfigDir, { recursive: true });
    }

    // Read existing config or start with empty
    let configContent = '';
    if (fs.existsSync(codexConfigPath)) {
        configContent = fs.readFileSync(codexConfigPath, 'utf-8');
    }

    let modified = false;

    // Check if playwright MCP is already configured
    if (configContent.includes('[mcp_servers.playwright]')) {
        // Extract the playwright section to check for issues
        const playwrightSectionMatch = configContent.match(
            /\[mcp_servers\.playwright\][\s\S]*?(?=\n\[|$)/
        );
        const playwrightSection = playwrightSectionMatch ? playwrightSectionMatch[0] : '';

        // IMPORTANT: Fix CDP endpoint if it's set to Docker's host.docker.internal
        // Native mode needs 127.0.0.1, Docker mode uses its own entrypoint.sh config
        if (playwrightSection.includes('host.docker.internal')) {
            configContent = configContent.replace(
                /host\.docker\.internal:(\d+)/g,
                '127.0.0.1:$1'
            );
            modified = true;
            console.log('[Config] Updated Playwright CDP endpoint from Docker to native (127.0.0.1)');
        }

        if (!playwrightSection.includes('startup_timeout_sec')) {
            // Add timeout after the playwright section's args line
            configContent = configContent.replace(
                /(\[mcp_servers\.playwright\][\s\S]*?args\s*=\s*\[.*?\])/,
                '$1\nstartup_timeout_sec = 60'
            );
            modified = true;
            console.log('[Config] Added startup_timeout_sec to existing Playwright config');
        } else {
            console.log('[Config] Playwright MCP already configured with timeout');
        }
    } else {
        // Add Playwright MCP configuration with extended timeout
        const playwrightConfig = `

# GnuNae Playwright MCP - Auto-configured
[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest", "--cdp-endpoint", "http://127.0.0.1:9222"]
startup_timeout_sec = 60
`;
        configContent = configContent.trimEnd() + playwrightConfig;
        modified = true;
        console.log('[Config] Added Playwright MCP to Codex config');
    }

    if (modified) {
        fs.writeFileSync(codexConfigPath, configContent, 'utf-8');
        console.log('[Config] Updated Codex config:', codexConfigPath);
    }
}

// Read package.json for app info
const packageJson = require('../../package.json');
const APP_NAME = packageJson.productName || 'GnuNae';
const APP_VERSION = packageJson.version || '0.0.1';

// ============ SINGLETON MODE ============
// Ensure only one instance of the app runs at a time (works on macOS, Windows, Linux)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    console.log('[Main] Another instance is already running, quitting...');
    app.quit();
}

// Handle second-instance event - focus existing window when user tries to launch again
app.on('second-instance', (event, commandLine, workingDirectory) => {
    console.log('[Main] Second instance detected, focusing existing window');
    const mainWin = getMainWindow();
    if (mainWin) {
        if (mainWin.isMinimized()) mainWin.restore();
        mainWin.show();
        mainWin.focus();
    }
});
// ============ END SINGLETON MODE ============

// Window session interface for multi-window isolation
interface WindowSession {
    window: BrowserWindow;
    sessionId: string;
    workDir: string;
    codexProcesses: Map<string, ChildProcess>;
    tabManager: TabManager | null;
    sidebarVisible: boolean;
    // Docker sandbox support
    sandbox?: {
        instance: SandboxInstance;
        client: SandboxApiClient;
        heartbeatTimer?: NodeJS.Timeout; // Timer for sending heartbeats
    };
    useDocker: boolean;
}

// Registry of all window sessions
const windowSessions: Map<number, WindowSession> = new Map();

// Generate unique session ID for a window
function generateSessionId(windowId: number): string {
    return `gnunae-${windowId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Legacy compatibility - get session for main window or first window
function getActiveSession(): WindowSession | undefined {
    // Try to find focused window's session
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow && windowSessions.has(focusedWindow.id)) {
        return windowSessions.get(focusedWindow.id);
    }
    // Fall back to first window
    return windowSessions.values().next().value;
}

let authService: AuthService;

// Compatibility getter for mainWindow - returns focused window or first window
function getMainWindow(): BrowserWindow | null {
    const session = getActiveSession();
    return session?.window || null;
}

// Get session by event sender (for IPC handlers)
function getSessionBySender(sender: Electron.WebContents): WindowSession | undefined {
    const window = BrowserWindow.fromWebContents(sender);
    if (window && windowSessions.has(window.id)) {
        return windowSessions.get(window.id);
    }
    return getActiveSession();
}

// Compatibility: global mainWindow reference (points to first window)
let mainWindow: BrowserWindow | null = null;
let tabManager: TabManager | null = null;
let sidebarVisible = true;

// System tray manager
let trayManager: TrayManager | null = null;

// Command line arguments for hidden mode and external browser
interface CommandLineArgs {
    hidden: boolean;
    externalBrowser: string | null;
    cdpPort: number | null;
    chatMode: boolean;  // Chat-only mode for external browser integration
}

function parseCommandLineArgs(): CommandLineArgs {
    const args = process.argv.slice(2);
    console.log('[Main] Raw process.argv:', process.argv);
    console.log('[Main] Arguments to parse:', args);

    const result: CommandLineArgs = {
        hidden: false,
        externalBrowser: null,
        cdpPort: null,
        chatMode: false,
    };

    for (const arg of args) {
        console.log('[Main] Processing arg:', arg);
        if (arg === '--hidden') {
            result.hidden = true;
        } else if (arg === '--chat-mode') {
            result.chatMode = true;
        } else if (arg.startsWith('--external-browser=')) {
            result.externalBrowser = arg.split('=')[1];
        } else if (arg.startsWith('--cdp-port=')) {
            result.cdpPort = parseInt(arg.split('=')[1], 10);
        }
    }

    return result;
}

const cliArgs = parseCommandLineArgs();
console.log('[Main] Parsed command line args:', JSON.stringify(cliArgs));

// Global codexProcesses for backward compatibility (uses active session's processes)
function getCodexProcesses(): Map<string, ChildProcess> {
    const session = getActiveSession();
    return session?.codexProcesses || new Map();
}

// Alias for compatibility
const codexProcesses = {
    get: (key: string) => getCodexProcesses().get(key),
    set: (key: string, value: ChildProcess) => getCodexProcesses().set(key, value),
    delete: (key: string) => getCodexProcesses().delete(key),
    has: (key: string) => getCodexProcesses().has(key),
    forEach: (cb: (value: ChildProcess, key: string) => void) => getCodexProcesses().forEach(cb),
};

const SIDEBAR_WIDTH = 340;
const TOPBAR_HEIGHT = 50;
const TAB_BAR_HEIGHT = 36;


/**
 * Get the working directory for LLM execution.
 * Returns custom path if set in settings, otherwise creates a session-specific temp dir.
 */
function getLLMWorkingDir(windowId?: number): string {
    const { settingsService } = require('../core/settings');
    const customDir = settingsService.get('codex.workingDir') || '';

    if (customDir && fs.existsSync(customDir)) {
        return customDir;
    }

    // Get session for this window
    const session = windowId
        ? windowSessions.get(windowId)
        : getActiveSession();

    if (session) {
        // Create directory if it doesn't exist
        if (!fs.existsSync(session.workDir)) {
            fs.mkdirSync(session.workDir, { recursive: true });
        }
        return session.workDir;
    }

    // Fallback: create a temp dir for app-level operations
    const tempBase = os.tmpdir();
    const fallbackDir = path.join(tempBase, `gnunae-fallback-${Date.now()}`);
    if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
    }
    return fallbackDir;
}

// OpenAI/ChatGPT OAuth URLs
const OPENAI_AUTH_URL = 'https://chatgpt.com/auth/login';
const CHATGPT_DOMAIN = 'chatgpt.com';

// Tab state interface
interface TabState {
    id: string;
    browserView: BrowserView;
    url: string;
    title: string;
}

// Tab Manager for multi-tab browsing
class TabManager {
    private tabs: Map<string, TabState> = new Map();
    private activeTabId: string | null = null;
    private nextTabId = 1;
    private ownerWindow: BrowserWindow;

    constructor(window: BrowserWindow) {
        this.ownerWindow = window;
    }

    createTab(url?: string): TabState {
        const id = `tab-${this.nextTabId++}`;

        const browserView = new BrowserView({
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: false,
                webSecurity: true,
                allowRunningInsecureContent: false,
            },
        });

        const tabState: TabState = {
            id,
            browserView,
            url: url || 'about:blank',
            title: 'New Tab',
        };

        // Track URL changes - only for main frame, not iframes
        browserView.webContents.on('did-frame-navigate', (_, navUrl, _httpResponseCode, _httpStatusText, isMainFrame) => {
            if (isMainFrame) {
                tabState.url = navUrl;
                this.notifyTabUpdate(tabState);
            }
        });

        browserView.webContents.on('did-navigate-in-page', (_, navUrl, isMainFrame) => {
            if (isMainFrame) {
                tabState.url = navUrl;
                this.notifyTabUpdate(tabState);
            }
        });

        browserView.webContents.on('page-title-updated', (_, title) => {
            tabState.title = title || 'New Tab';
            this.notifyTabUpdate(tabState);
        });

        browserView.webContents.on('did-start-loading', () => {
            if (this.activeTabId === id) {
                this.ownerWindow?.webContents.send('browser:loading', true);
            }
        });

        browserView.webContents.on('did-stop-loading', () => {
            if (this.activeTabId === id) {
                this.ownerWindow?.webContents.send('browser:loading', false);
            }
        });

        // Intercept gnunae:// protocol URLs for internal actions
        browserView.webContents.on('will-navigate', (event, navUrl) => {
            if (navUrl.startsWith('gnunae://')) {
                event.preventDefault();

                if (navUrl === 'gnunae://login') {
                    // Trigger the Codex login flow
                    console.log('[Main] Login triggered from internal page');
                    this.ownerWindow?.webContents.send('trigger-codex-login');
                }
            }
        });

        // Intercept window.open() and target="_blank" to open as new tabs
        browserView.webContents.setWindowOpenHandler(({ url: newUrl }) => {
            // Create new tab with the URL instead of opening new window
            this.createTab(newUrl);
            return { action: 'deny' }; // Prevent default new window
        });

        this.tabs.set(id, tabState);

        // Load URL if provided
        if (url) {
            browserView.webContents.loadURL(url);
        }

        // If no active tab, make this one active
        if (!this.activeTabId) {
            this.switchToTab(id);
        }

        this.notifyTabsChanged();
        return tabState;
    }


    closeTab(tabId: string): boolean {
        const tab = this.tabs.get(tabId);
        if (!tab) return false;

        // Destroy the BrowserView
        (tab.browserView.webContents as any).destroy?.();
        this.tabs.delete(tabId);

        // If closing active tab, switch to another or create new
        if (this.activeTabId === tabId) {
            const remaining = Array.from(this.tabs.keys());
            if (remaining.length > 0) {
                this.switchToTab(remaining[remaining.length - 1]);
            } else {
                // Don't leave in broken state - create a new tab
                this.activeTabId = null;
                this.createTab('https://www.google.com');
            }
        }

        this.notifyTabsChanged();
        return true;
    }

    switchToTab(tabId: string): boolean {
        const tab = this.tabs.get(tabId);
        if (!tab || !this.ownerWindow) return false;

        this.activeTabId = tabId;
        this.ownerWindow.setBrowserView(tab.browserView);
        this.updateLayout();

        // Notify UI of active tab change
        this.ownerWindow.webContents.send('browser:url-updated', tab.url);
        this.ownerWindow.webContents.send('browser:title-updated', tab.title);
        this.notifyTabsChanged();

        return true;
    }

    getActiveTab(): TabState | null {
        if (!this.activeTabId) return null;
        return this.tabs.get(this.activeTabId) || null;
    }

    getActiveTabId(): string | null {
        return this.activeTabId;
    }

    getAllTabs(): Array<{ id: string; url: string; title: string; isActive: boolean }> {
        return Array.from(this.tabs.values()).map(tab => ({
            id: tab.id,
            url: tab.url,
            title: tab.title,
            isActive: tab.id === this.activeTabId,
        }));
    }

    getTab(tabId: string): TabState | undefined {
        return this.tabs.get(tabId);
    }

    updateLayout(): void {
        const tab = this.getActiveTab();
        if (!this.ownerWindow || !tab) return;

        const contentBounds = this.ownerWindow.getContentBounds();
        // Get sidebar visibility for this window
        const windowSession = windowSessions.get(this.ownerWindow.id);
        const sidebarWidth = (windowSession?.sidebarVisible ?? true) ? SIDEBAR_WIDTH : 0;
        tab.browserView.setBounds({
            x: 0,
            y: TOPBAR_HEIGHT + TAB_BAR_HEIGHT,
            width: contentBounds.width - sidebarWidth,
            height: contentBounds.height - TOPBAR_HEIGHT - TAB_BAR_HEIGHT,
        });
    }

    private notifyTabUpdate(tab: TabState): void {
        if (tab.id === this.activeTabId) {
            this.ownerWindow?.webContents.send('browser:url-updated', tab.url);
            this.ownerWindow?.webContents.send('browser:title-updated', tab.title);
        }
        this.notifyTabsChanged();
    }

    private notifyTabsChanged(): void {
        this.ownerWindow?.webContents.send('tabs:updated', this.getAllTabs());
    }

    destroy(): void {
        for (const tab of this.tabs.values()) {
            (tab.browserView.webContents as any).destroy?.();
        }
        this.tabs.clear();
        this.activeTabId = null;
    }
}

// Set app name for macOS menu bar
app.setName(APP_NAME);


// Create custom menu for macOS
function createMenu(): void {
    const isMac = process.platform === 'darwin';

    const template: Electron.MenuItemConstructorOptions[] = [
        // App menu (macOS only)
        ...(isMac ? [{
            label: APP_NAME,
            submenu: [
                {
                    label: `About ${APP_NAME}`,
                    click: () => {
                        const { dialog } = require('electron');
                        dialog.showMessageBox({
                            type: 'info',
                            title: `About ${APP_NAME}`,
                            message: APP_NAME,
                            detail: `Version ${APP_VERSION}\n\nAI-powered browser with Codex sidebar for intelligent web automation.\n\n© 2024 Won Dong\n\n─── Open Source Libraries ───\n• Electron - MIT License\n• React - MIT License\n• Playwright - Apache 2.0 License\n• OpenAI Codex CLI - OpenAI License\n• MCP SDK - Anthropic License\n• Zod - MIT License\n• UUID - MIT License`,
                        });
                    }
                },
                { type: 'separator' as const },
                {
                    label: 'Settings...',
                    accelerator: 'Cmd+,',
                    click: () => {
                        createSettingsWindow();
                    }
                },
                { type: 'separator' as const },
                { role: 'services' as const },
                { type: 'separator' as const },
                { role: 'hide' as const },
                { role: 'hideOthers' as const },
                { role: 'unhide' as const },
                { type: 'separator' as const },
                { role: 'quit' as const }
            ] as Electron.MenuItemConstructorOptions[]
        }] : []),
        // File menu
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Window',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => createWindow()
                },
                { type: 'separator' as const },
                isMac ? { role: 'close' as const } : { role: 'quit' as const }
            ]
        },
        // Edit menu
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' as const },
                { role: 'redo' as const },
                { type: 'separator' as const },
                { role: 'cut' as const },
                { role: 'copy' as const },
                { role: 'paste' as const },
                { role: 'selectAll' as const },
                ...(!isMac ? [
                    { type: 'separator' as const },
                    {
                        label: 'Settings',
                        accelerator: 'Ctrl+,',
                        click: () => {
                            createSettingsWindow();
                        }
                    }
                ] : [])
            ]
        },
        // View menu
        {
            label: 'View',
            submenu: [
                {
                    label: 'Show Chat Panel',
                    accelerator: 'Cmd+1',
                    click: () => {
                        mainWindow?.webContents.send('menu:show-panel', 'chat');
                    }
                },
                {
                    label: 'Show Task Manager',
                    accelerator: 'Cmd+2',
                    click: () => {
                        mainWindow?.webContents.send('menu:show-panel', 'tasks');
                    }
                },
                {
                    label: 'Hide Panel',
                    accelerator: 'Cmd+0',
                    click: () => {
                        mainWindow?.webContents.send('menu:show-panel', null);
                    }
                },
                { type: 'separator' as const },
                { role: 'reload' as const },
                { role: 'forceReload' as const },
                { role: 'toggleDevTools' as const },
                { type: 'separator' as const },
                { role: 'resetZoom' as const },
                { role: 'zoomIn' as const },
                { role: 'zoomOut' as const },
                { type: 'separator' as const },
                { role: 'togglefullscreen' as const }
            ]
        },
        // Window menu
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' as const },
                ...(isMac ? [
                    { role: 'zoom' as const },
                    { type: 'separator' as const },
                    { role: 'front' as const }
                ] : [])
            ]
        },
        // Help menu (rightmost)
        {
            label: 'Help',
            submenu: [
                {
                    label: 'GnuNae Help',
                    click: async () => {
                        const { shell } = require('electron');
                        await shell.openExternal('https://www.gnunae.com');
                    }
                },
                { type: 'separator' as const },
                {
                    label: 'About GnuNae',
                    click: () => {
                        mainWindow?.webContents.send('menu:show-about');
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

function createWindow(): void {
    // Initialize auth service (only once)
    if (!authService) {
        authService = new AuthService();
    }

    // Create the window
    const newWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 700,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 15, y: 15 },
    });

    // Generate session for this window
    const windowId = newWindow.id;
    const sessionId = generateSessionId(windowId);
    const workDir = path.join(os.tmpdir(), sessionId);

    // Create working directory
    if (!fs.existsSync(workDir)) {
        fs.mkdirSync(workDir, { recursive: true });
    }

    // Create tab manager for this window
    const windowTabManager = new TabManager(newWindow);

    // Register window session
    const session: WindowSession = {
        window: newWindow,
        sessionId,
        workDir,
        codexProcesses: new Map(),
        tabManager: windowTabManager,
        sidebarVisible: true,
        useDocker: false,  // Docker mode disabled by default, can be enabled per-window
    };
    windowSessions.set(windowId, session);

    // Compatibility: set global mainWindow to first window created
    if (!mainWindow) {
        mainWindow = newWindow;
        tabManager = windowTabManager;
    }

    // Load the UI
    if (process.env.VITE_DEV_SERVER_URL) {
        newWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        newWindow.loadFile(path.join(__dirname, '../ui/index.html'));
    }

    // Create initial tab with appropriate page
    const startUrl = authService.isAuthenticated()
        ? 'https://www.google.com'
        : `file://${path.join(__dirname, '../ui/login.html')}`;
    windowTabManager.createTab(startUrl);

    // Handle resize
    newWindow.on('resize', () => {
        windowTabManager?.updateLayout();
    });

    // Handle window close - cleanup session
    newWindow.on('closed', () => {
        const closingSession = windowSessions.get(windowId);
        if (closingSession) {
            // Kill any running Codex processes for this window
            closingSession.codexProcesses.forEach((proc, key) => {
                try {
                    proc.kill('SIGTERM');
                } catch (e) {
                    // Process may already be dead
                }
            });

            // Clean up Docker sandbox if any
            if (closingSession.sandbox) {
                // Stop heartbeat timer
                if (closingSession.sandbox.heartbeatTimer) {
                    clearInterval(closingSession.sandbox.heartbeatTimer);
                }
                const dockerManager = getDockerManager();
                dockerManager.destroyInstance(closingSession.sandbox.instance.id).catch(err => {
                    console.error('[Main] Failed to cleanup Docker sandbox:', err);
                });
            }

            // Clean up temp directory
            if (closingSession.workDir && closingSession.workDir.includes(os.tmpdir())) {
                try {
                    fs.rmSync(closingSession.workDir, { recursive: true, force: true });
                    console.log('[Main] Cleaned up window session directory:', closingSession.workDir);
                } catch (err) {
                    // Ignore cleanup errors
                }
            }

            // Destroy tab manager
            closingSession.tabManager?.destroy();

            // Remove from registry
            windowSessions.delete(windowId);
        }

        // Update global reference if this was the main window
        if (mainWindow === newWindow) {
            mainWindow = null;
            tabManager = null;
            // Try to set a new main window if any remain
            const firstSession = windowSessions.values().next().value;
            if (firstSession) {
                mainWindow = firstSession.window;
                tabManager = firstSession.tabManager;
            }
        }
    });

    console.log(`[Main] Created window ${windowId} with session ${sessionId}`);
}

// Chat window for external browser mode - shows only the chat panel
let chatWindow: BrowserWindow | null = null;
let chatWindowSession: WindowSession | null = null;
let externalBrowserTitleInterval: NodeJS.Timeout | null = null;

interface ChatWindowOptions {
    browserName: string;
    browserId: string;
}

function createChatWindow(options: ChatWindowOptions): BrowserWindow {
    // Initialize auth service (only once)
    if (!authService) {
        authService = new AuthService();
    }

    // Create a smaller chat-only window
    const newWindow = new BrowserWindow({
        width: 400,
        height: 700,
        minWidth: 350,
        minHeight: 500,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        title: `${options.browserName} - GnuNae`,
        // No custom title bar - use standard window frame
        frame: true,
    });

    // Generate session for this window
    const windowId = newWindow.id;
    const sessionId = generateSessionId(windowId);
    const workDir = path.join(os.tmpdir(), sessionId);

    // Create working directory
    if (!fs.existsSync(workDir)) {
        fs.mkdirSync(workDir, { recursive: true });
    }

    // Register window session (no tab manager for chat mode)
    const session: WindowSession = {
        window: newWindow,
        sessionId,
        workDir,
        codexProcesses: new Map(),
        tabManager: null,  // No tabs in chat mode
        sidebarVisible: true,
        useDocker: false,
    };
    windowSessions.set(windowId, session);
    chatWindow = newWindow;
    chatWindowSession = session;

    // Load the chat-mode UI with query param
    if (process.env.VITE_DEV_SERVER_URL) {
        newWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?chatMode=true&browserName=${encodeURIComponent(options.browserName)}`);
    } else {
        newWindow.loadFile(path.join(__dirname, '../ui/index.html'), {
            query: { chatMode: 'true', browserName: options.browserName }
        });
    }

    // Start polling external browser title via CDP
    startExternalBrowserTitleSync(newWindow, options.browserName);

    // Handle window close
    newWindow.on('closed', () => {
        stopExternalBrowserTitleSync();

        const closingSession = windowSessions.get(windowId);
        if (closingSession) {
            // Kill any running Codex processes
            closingSession.codexProcesses.forEach((proc) => {
                try { proc.kill('SIGTERM'); } catch { }
            });

            // Clean up temp directory
            if (closingSession.workDir && closingSession.workDir.includes(os.tmpdir())) {
                try {
                    fs.rmSync(closingSession.workDir, { recursive: true, force: true });
                } catch { }
            }

            windowSessions.delete(windowId);
        }

        chatWindow = null;
        chatWindowSession = null;
    });

    console.log(`[Main] Created chat window ${windowId} for ${options.browserName}`);
    return newWindow;
}

// Poll external browser title via CDP and update chat window title
function startExternalBrowserTitleSync(window: BrowserWindow, browserName: string): void {
    const externalBrowserMgr = getExternalBrowserManager();

    const updateTitle = async () => {
        if (!window || window.isDestroyed()) {
            stopExternalBrowserTitleSync();
            return;
        }

        const status = externalBrowserMgr.getStatus();
        if (status.hasActiveSession && status.cdpPort) {
            try {
                // Get page title from CDP
                const http = require('http');
                const response = await new Promise<string>((resolve, reject) => {
                    const req = http.get(`http://127.0.0.1:${status.cdpPort}/json`, (res: any) => {
                        let data = '';
                        res.on('data', (chunk: string) => data += chunk);
                        res.on('end', () => resolve(data));
                    });
                    req.on('error', reject);
                    req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
                });

                const pages = JSON.parse(response);
                // Find the first non-extension page
                const page = pages.find((p: any) => p.type === 'page' && !p.url.startsWith('chrome-extension://'));
                if (page && page.title) {
                    window.setTitle(`${browserName} | ${page.title} - GnuNae`);
                    // Also send to renderer for UI updates
                    window.webContents.send('external-browser-title', page.title);
                    window.webContents.send('external-browser-url', page.url);
                }
            } catch {
                // CDP query failed, keep existing title
            }
        }
    };

    // Update immediately, then poll every 2 seconds
    updateTitle();
    externalBrowserTitleInterval = setInterval(updateTitle, 2000);
}

function stopExternalBrowserTitleSync(): void {
    if (externalBrowserTitleInterval) {
        clearInterval(externalBrowserTitleInterval);
        externalBrowserTitleInterval = null;
    }
}

// Create standalone settings window
let settingsWindow: BrowserWindow | null = null;

function createSettingsWindow(): void {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.focus();
        return;
    }

    settingsWindow = new BrowserWindow({
        width: 520,
        height: 650,
        minWidth: 480,
        minHeight: 500,
        resizable: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        frame: false,  // No OS window frame/title bar
        transparent: false,
        parent: chatWindow || undefined,
        modal: false,
    });

    // Remove menu for this window
    settingsWindow.setMenu(null);

    if (process.env.VITE_DEV_SERVER_URL) {
        settingsWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?settingsOnly=true`);
    } else {
        settingsWindow.loadFile(path.join(__dirname, '../ui/index.html'), {
            query: { settingsOnly: 'true' }
        });
    }

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
}

function updateLayout(): void {
    tabManager?.updateLayout();
}


// IPC Handlers
function setupIpcHandlers(): void {
    // Get session from event sender
    const getSessionFromEvent = (event: Electron.IpcMainInvokeEvent): WindowSession | undefined => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window) {
            const session = windowSessions.get(window.id);
            if (session) {
                return session;
            }
            // Window found but session not in map - fallback to active session
            console.log(`[Main] Session not found for window ${window.id}, falling back to active session`);
        }
        return getActiveSession();
    };


    // Get active browser view for the sender's window
    const getActiveViewFromEvent = (event: Electron.IpcMainInvokeEvent) => {
        const session = getSessionFromEvent(event);
        return session?.tabManager?.getActiveTab()?.browserView;
    };

    // Backward-compatible helper for handlers without event context
    const getActiveView = () => {
        const session = getActiveSession();
        return session?.tabManager?.getActiveTab()?.browserView;
    };

    // UI handlers - toggle BrowserView for overlays
    ipcMain.handle('ui:hide-browser', (event) => {
        const session = getSessionFromEvent(event);
        const browserView = session?.tabManager?.getActiveTab()?.browserView;
        if (browserView && session?.window) {
            session.window.removeBrowserView(browserView);
        }
        return { success: true };
    });

    ipcMain.handle('ui:show-browser', (event) => {
        const session = getSessionFromEvent(event);
        const browserView = session?.tabManager?.getActiveTab()?.browserView;
        if (browserView && session?.window) {
            session.window.setBrowserView(browserView);
            session.tabManager?.updateLayout();
        }
        return { success: true };
    });

    // Set sidebar visibility and update browser layout
    ipcMain.handle('ui:set-sidebar-visible', (event, visible: boolean) => {
        const session = getSessionFromEvent(event);
        if (session) {
            session.sidebarVisible = visible;
            session.tabManager?.updateLayout();
        }
        return { success: true };
    });

    // Tab handlers
    ipcMain.handle('tab:create', (event, url?: string) => {
        const session = getSessionFromEvent(event);
        const tab = session?.tabManager?.createTab(url);
        return { success: !!tab, tabId: tab?.id };
    });

    ipcMain.handle('tab:close', (event, tabId: string) => {
        const session = getSessionFromEvent(event);
        const success = session?.tabManager?.closeTab(tabId) ?? false;
        return { success };
    });

    ipcMain.handle('tab:switch', (event, tabId: string) => {
        const session = getSessionFromEvent(event);
        const success = session?.tabManager?.switchToTab(tabId) ?? false;
        return { success };
    });

    ipcMain.handle('tab:getAll', (event) => {
        const session = getSessionFromEvent(event);
        return session?.tabManager?.getAllTabs() ?? [];
    });

    ipcMain.handle('tab:getActive', (event) => {
        const session = getSessionFromEvent(event);
        return session?.tabManager?.getActiveTabId() ?? null;
    });

    // DataStore handlers
    ipcMain.handle('datastore:getAll', () => {
        const { dataStoreService } = require('../core/datastore');
        return dataStoreService.getAll();
    });

    ipcMain.handle('datastore:get', (_, key: string) => {
        const { dataStoreService } = require('../core/datastore');
        return dataStoreService.get(key);
    });

    ipcMain.handle('datastore:set', (_, key: string, value: string | number | boolean) => {
        const { dataStoreService } = require('../core/datastore');
        dataStoreService.set(key, value);
        return { success: true };
    });

    ipcMain.handle('datastore:remove', (_, key: string) => {
        const { dataStoreService } = require('../core/datastore');
        const success = dataStoreService.remove(key);
        return { success };
    });

    // Settings handlers
    ipcMain.handle('settings:get', () => {
        const { settingsService } = require('../core/settings');
        return settingsService.getAll();
    });

    ipcMain.handle('settings:update', (_, settings) => {
        const { settingsService } = require('../core/settings');
        const oldSettings = settingsService.getAll();
        settingsService.update(settings);

        // Sync launch at startup setting with OS login items
        const newSettings = settingsService.getAll();
        if (oldSettings.app?.launchAtStartup !== newSettings.app?.launchAtStartup) {
            const launchAtStartup = newSettings.app?.launchAtStartup || false;
            console.log('[Main] Setting launch at startup:', launchAtStartup);

            app.setLoginItemSettings({
                openAtLogin: launchAtStartup,
                // On Windows, use args; on macOS, openAsHidden is preferred
                openAsHidden: launchAtStartup, // macOS: start hidden
                args: launchAtStartup ? ['--hidden'] : [], // Windows/Linux: pass hidden flag
            });

            // Auto-enable hidden mode when launch at startup is enabled
            if (launchAtStartup && !newSettings.app?.launchHidden) {
                settingsService.update({ app: { ...newSettings.app, launchHidden: true } });
            }
        }

        // Broadcast settings change to all renderers
        const updatedSettings = settingsService.getAll();
        mainWindow?.webContents.send('settings:changed', updatedSettings);

        return { success: true };
    });


    // Get current LLM working directory
    ipcMain.handle('settings:get-llm-workdir', () => {
        return getLLMWorkingDir();
    });

    // Open directory picker dialog
    ipcMain.handle('dialog:browse-directory', async (_, defaultPath?: string) => {
        const { dialog } = require('electron');
        const result = await dialog.showOpenDialog(mainWindow!, {
            properties: ['openDirectory', 'createDirectory'],
            defaultPath: defaultPath || os.homedir(),
            title: 'Select Working Directory'
        });

        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }

        return result.filePaths[0];
    });

    // Attach files for Codex prompt - copies to working directory
    ipcMain.handle('files:attach', async (event) => {
        const senderWindow = BrowserWindow.fromWebContents(event.sender);

        const result = await dialog.showOpenDialog(senderWindow || mainWindow!, {
            properties: ['openFile', 'multiSelections'],
            title: 'Attach Files',
            filters: [
                { name: 'All Files', extensions: ['*'] },
                { name: 'Text Files', extensions: ['txt', 'md', 'json', 'csv', 'xml', 'yaml', 'yml'] },
                { name: 'Code Files', extensions: ['js', 'ts', 'py', 'html', 'css', 'tsx', 'jsx'] },
                { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx'] }
            ]
        });

        if (result.canceled || result.filePaths.length === 0) {
            return { success: false, files: [] };
        }

        // Get session working directory
        const senderSession = senderWindow ? windowSessions.get(senderWindow.id) : getActiveSession();
        const workDir = senderSession?.workDir || getLLMWorkingDir();

        // Copy files to working directory and track them
        const attachedFiles: { name: string; originalPath: string; workDirPath: string }[] = [];

        for (const filePath of result.filePaths) {
            const fileName = path.basename(filePath);
            const destPath = path.join(workDir, fileName);

            try {
                // Copy file to working directory
                fs.copyFileSync(filePath, destPath);
                attachedFiles.push({
                    name: fileName,
                    originalPath: filePath,
                    workDirPath: destPath
                });
                console.log(`[Main] Attached file: ${fileName} -> ${destPath}`);
            } catch (err) {
                console.error(`[Main] Failed to copy file ${filePath}:`, err);
            }
        }

        return { success: true, files: attachedFiles };
    });

    // Remove attached file from working directory
    ipcMain.handle('files:remove', async (event, fileName: string) => {
        const senderWindow = BrowserWindow.fromWebContents(event.sender);
        const senderSession = senderWindow ? windowSessions.get(senderWindow.id) : getActiveSession();
        const workDir = senderSession?.workDir || getLLMWorkingDir();

        const filePath = path.join(workDir, fileName);
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`[Main] Removed attached file: ${fileName}`);
            }
            return { success: true };
        } catch (err) {
            console.error(`[Main] Failed to remove file ${fileName}:`, err);
            return { success: false, error: String(err) };
        }
    });

    // Task handlers
    ipcMain.handle('task:list', () => {
        const { taskService } = require('../core/tasks');
        return taskService.getAllTasks();
    });

    ipcMain.handle('task:get', (_, id: string) => {
        const { taskService } = require('../core/tasks');
        return taskService.getTask(id);
    });

    ipcMain.handle('task:create', (_, taskData: any) => {
        const { taskService } = require('../core/tasks');
        return taskService.createTask(taskData);
    });

    ipcMain.handle('task:update', (_, id: string, updates: any) => {
        const { taskService } = require('../core/tasks');
        return taskService.updateTask(id, updates);
    });

    ipcMain.handle('task:delete', (_, id: string) => {
        const { taskService } = require('../core/tasks');
        return { success: taskService.deleteTask(id) };
    });

    ipcMain.handle('task:update-state', (_, id: string, stateUpdates: any) => {
        const { taskService } = require('../core/tasks');
        return taskService.updateTaskState(id, stateUpdates);
    });

    ipcMain.handle('task:get-for-domain', (_, url: string) => {
        const { taskService } = require('../core/tasks');
        return taskService.getTasksForDomain(url);
    });

    ipcMain.handle('task:is-running', () => {
        const { taskService } = require('../core/tasks');
        return { running: taskService.isTaskRunning(), taskId: taskService.getCurrentRunningTaskId() };
    });

    // Task Manager APIs
    ipcMain.handle('task:get-favorited', () => {
        const { taskService } = require('../core/tasks');
        return taskService.getFavoritedTasks();
    });

    ipcMain.handle('task:get-running', () => {
        const { taskService } = require('../core/tasks');
        return taskService.getRunningTasks();
    });

    ipcMain.handle('task:get-upcoming', () => {
        const { taskService } = require('../core/tasks');
        // Debug: Show all tasks
        const allTasks = taskService.getAllTasks();
        console.log(`[Tasks] All tasks (${allTasks.length}):`, allTasks.map((t: any) => ({
            id: t.id,
            name: t.name,
            enabled: t.enabled,
            trigger: t.trigger
        })));
        const scheduled = taskService.getUpcomingScheduledTasks();
        console.log(`[Tasks] getUpcomingScheduledTasks returned ${scheduled.length} tasks`);
        return scheduled;
    });

    ipcMain.handle('task:toggle-favorite', (_, id: string) => {
        const { taskService } = require('../core/tasks');
        return taskService.toggleFavorite(id);
    });

    // Max concurrency handlers
    ipcMain.handle('task:get-max-concurrency', () => {
        const { taskService } = require('../core/tasks');
        return taskService.maxConcurrency;
    });

    ipcMain.handle('task:set-max-concurrency', (_, max: number) => {
        const { taskService } = require('../core/tasks');
        taskService.setMaxConcurrency(max);
        console.log(`[Tasks] Max concurrency set to: ${max}`);
        return { success: true };
    });

    ipcMain.handle('task:can-run-more', () => {
        const { taskService } = require('../core/tasks');
        return taskService.canRunMoreTasks();
    });

    ipcMain.handle('task:stop', (_, taskId: string) => {
        const { taskService } = require('../core/tasks');
        // Stop the running task
        taskService.clearTaskRunning(taskId);
        // TODO: Actually stop the Codex process for this task
        return { success: true };
    });

    // Clear running task state (called when task completes)
    ipcMain.handle('task:clear-running', (_, taskId: string) => {
        const { taskService } = require('../core/tasks');
        taskService.clearTaskRunning(taskId);
        taskService.recordRunResult(taskId, { success: true, blocked: false });
        console.log(`[Tasks] Task completed and cleared: ${taskId}`);
        return { success: true };
    });

    ipcMain.handle('task:run', async (_, taskId: string) => {
        const { taskService } = require('../core/tasks');

        // Check if another task is already running
        if (taskService.isTaskRunning()) {
            return { success: false, error: 'Another task is already running' };
        }

        const task = taskService.getTask(taskId);
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        // Mark task as running
        taskService.setTaskRunning(taskId);

        // Use optimized prompt if available, otherwise original
        const promptToUse = task.optimizedPrompt || task.originalPrompt;
        const modeToUse = task.mode || 'agent';
        const startUrl = task.startUrl;
        const triggerType = task.trigger.type; // 'one-time' | 'on-going' | 'scheduled'

        console.log(`[Tasks] Running task: ${task.name} (${triggerType}) with mode: ${modeToUse}${startUrl ? `, startUrl: ${startUrl}` : ''}`);

        // Emit to UI that task is starting
        mainWindow?.webContents.send('task:started', { taskId, name: task.name });

        // Execute via codex - this will use the existing codex:execute infrastructure
        // We trigger it via the existing IPC mechanism by sending an event
        try {
            // Determine tab behavior based on trigger type:
            // - one-time/scheduled: use new tab, close when done
            // - on-going: use current tab
            const useNewTab = triggerType === 'one-time' || triggerType === 'scheduled';

            console.log(`[Tasks] Sending task:execute-prompt to UI, useNewTab: ${useNewTab}`);
            mainWindow?.webContents.send('task:execute-prompt', {
                taskId,
                prompt: promptToUse,
                mode: modeToUse,
                name: task.name,
                startUrl,
                triggerType,
                useNewTab
            });

            return { success: true, taskId };
        } catch (error: any) {
            taskService.setTaskRunning(null);
            taskService.recordRunResult(taskId, { success: false, blocked: false });
            return { success: false, error: error.message };
        }
    });

    // Auth handlers
    ipcMain.handle('auth:is-authenticated', () => {
        return authService.isAuthenticated();
    });

    ipcMain.handle('auth:get-user', () => {
        return authService.getEmail();
    });

    ipcMain.handle('auth:start-google-login', async () => {
        const browserView = getActiveView();
        if (!browserView) return { success: false };

        // Navigate to OpenAI login page which offers Google sign-in
        await browserView.webContents.loadURL(OPENAI_AUTH_URL);
        return { success: true };
    });

    ipcMain.handle('auth:logout', async () => {
        authService.clearToken();

        // Clear cookies
        const browserView = getActiveView();
        if (browserView) {
            await browserView.webContents.session.clearStorageData({
                storages: ['cookies'],
            });
        }

        // Navigate back to login page
        browserView?.webContents.loadFile(path.join(__dirname, '../ui/login.html'));
        mainWindow?.webContents.send('auth:status-changed', false);

        return { success: true };
    });

    ipcMain.handle('auth:show-login', async () => {
        const browserView = getActiveView();
        browserView?.webContents.loadFile(path.join(__dirname, '../ui/login.html'));
        return { success: true };
    });

    // Manual auth check - called by UI when it suspects user might be logged in
    ipcMain.handle('auth:check-now', async () => {
        const browserView = getActiveView();
        if (!browserView) return { authenticated: false };
        console.log('[Main] Manual auth check requested');
        const success = await authService.extractTokenFromCookies(browserView.webContents.session);

        // Notify UI of auth status change
        if (success) {
            mainWindow?.webContents.send('auth:status-changed', true);
        }

        return { authenticated: success };
    });

    // ==========================================
    // Docker/Sandbox IPC Handlers
    // ==========================================

    // Check if Docker is available
    ipcMain.handle('docker:is-available', async () => {
        const dockerManager = getDockerManager();
        const available = await dockerManager.isAvailable();
        return { available };
    });

    // Get Docker runtime info
    ipcMain.handle('docker:get-runtime-info', async () => {
        const dockerManager = getDockerManager();
        if (!dockerManager.getRuntimeInfo()) {
            await dockerManager.initialize();
            // Clean up any orphaned containers from previous sessions (crashes, etc.)
            await dockerManager.cleanupOrphanedContainers();
        }
        return dockerManager.getRuntimeInfo();
    });

    // Create a sandbox instance for a window
    ipcMain.handle('docker:create-sandbox', async (event, config?: any) => {
        const session = getSessionFromEvent(event);
        if (!session) {
            return { success: false, error: 'No session found' };
        }

        const dockerManager = getDockerManager();
        if (!await dockerManager.isAvailable()) {
            return { success: false, error: 'Docker is not available' };
        }

        try {
            // Destroy existing sandbox if any
            if (session.sandbox) {
                await dockerManager.destroyInstance(session.sandbox.instance.id);
            }

            // For electron-cdp mode (external browser), get the CDP endpoint from the active session
            // The external browser manager tracks the actual running browser's CDP port and endpoint
            let finalConfig = { ...config };
            if (config?.browserMode === 'electron-cdp') {
                try {
                    // Get the active external browser session which has the actual dynamic CDP port
                    const { getExternalBrowserManager } = require('../core/external-browser-manager');
                    const browserManager = getExternalBrowserManager();
                    const activeSession = browserManager.getActiveSession();

                    if (!activeSession) {
                        console.error('[Docker] No active external browser session found');
                        return { success: false, error: 'No external browser session active. Please launch an external browser first.' };
                    }

                    const externalCdpPort = activeSession.cdpPort;
                    console.log('[Docker] Using external browser CDP port from active session:', externalCdpPort);

                    // Fetch WebSocket URL from external browser's CDP endpoint
                    const http = require('http');
                    const wsUrl = await new Promise<string>((resolve, reject) => {
                        http.get(`http://127.0.0.1:${externalCdpPort}/json/version`, (res: any) => {
                            let data = '';
                            res.on('data', (chunk: string) => data += chunk);
                            res.on('end', () => {
                                try {
                                    const json = JSON.parse(data);
                                    // Rewrite 127.0.0.1 to host.docker.internal for Docker access
                                    const wsUrlForDocker = json.webSocketDebuggerUrl
                                        .replace('127.0.0.1', 'host.docker.internal')
                                        .replace('localhost', 'host.docker.internal');
                                    resolve(wsUrlForDocker);
                                } catch (e) {
                                    reject(e);
                                }
                            });
                        }).on('error', reject);
                    });
                    console.log('[Docker] Using CDP WebSocket URL:', wsUrl);
                    // Pass the WebSocket URL directly instead of HTTP endpoint
                    finalConfig.externalCdpEndpoint = wsUrl;
                } catch (err) {
                    console.error('[Docker] Failed to fetch CDP WebSocket URL:', err);
                    // Fall back to original endpoint
                }
            }

            // Mount working directory so attached files are accessible inside container
            // Convert Windows paths (C:\...) to Docker format (/c/...) for Docker Desktop
            const workDir = session.workDir;
            let dockerWorkDir = workDir;
            if (process.platform === 'win32') {
                dockerWorkDir = workDir
                    .replace(/^([A-Z]):\\/i, (_, drive: string) => `/${drive.toLowerCase()}/`)
                    .replace(/\\/g, '/');
            }
            finalConfig.volumes = finalConfig.volumes || [];
            finalConfig.volumes.push(`${dockerWorkDir}:/workspace`);
            console.log(`[Docker] Mounting working directory: ${workDir} -> /workspace`);

            // Create new sandbox instance
            const instance = await dockerManager.createInstance({
                name: `gnunae-window-${session.window.id}`,
                ...finalConfig,
            });

            // Create API client for this sandbox
            const client = createSandboxClient({
                apiPort: instance.apiPort,
                cdpPort: instance.cdpPort,
            });

            // Wait for sandbox to be healthy
            // Use longer timeout on Windows as container startup can be slower
            const maxAttempts = process.platform === 'win32' ? 60 : 30;
            const healthy = await client.waitForHealthy(maxAttempts, 1000);
            if (!healthy) {
                // Capture container logs for debugging
                const containerCmd = dockerManager.getContainerCommand();
                if (containerCmd) {
                    try {
                        const { promisify } = require('util');
                        const { execFile } = require('child_process');
                        const execFileAsync = promisify(execFile);
                        const { stdout, stderr } = await execFileAsync(
                            containerCmd,
                            ['logs', '--tail', '50', instance.containerName],
                            { timeout: 5000 }
                        );
                        console.error('[Docker] Container logs on health check failure:');
                        console.error(stdout || stderr || '(no logs)');
                    } catch (logErr: any) {
                        console.error('[Docker] Could not retrieve container logs:', logErr.message);
                    }
                }
                await dockerManager.destroyInstance(instance.id);
                return { success: false, error: 'Sandbox failed to become healthy' };
            }

            // Start heartbeat timer with retry logic and container-gone detection
            const HEARTBEAT_INTERVAL = 10000; // 10 seconds
            const MAX_HEARTBEAT_FAILURES = 5; // 5 failures = container is gone

            // Send first heartbeat immediately
            try {
                await client.sendHeartbeat();
                console.log('[Docker] Heartbeat watchdog enabled');
            } catch {
                // First heartbeat failed, continue anyway
            }

            // Store in session
            session.sandbox = { instance, client };
            session.useDocker = true;

            // Set interval for subsequent heartbeats
            session.sandbox.heartbeatTimer = setInterval(async () => {
                if (!session.sandbox) return;

                // Track failures
                const sandbox = session.sandbox;
                const heartbeatFailures = (sandbox as any).heartbeatFailures || 0;

                try {
                    const result = await sandbox.client.sendHeartbeat();
                    if (result.success) {
                        // Reset failure count on success
                        (sandbox as any).heartbeatFailures = 0;
                    } else {
                        throw new Error('Heartbeat returned false');
                    }
                } catch (err) {
                    // Increment failure count
                    (sandbox as any).heartbeatFailures = heartbeatFailures + 1;
                    console.error(`[Docker] Heartbeat failed (${(sandbox as any).heartbeatFailures}/${MAX_HEARTBEAT_FAILURES}):`, err);

                    // If we've failed too many times, container is likely gone
                    if ((sandbox as any).heartbeatFailures >= MAX_HEARTBEAT_FAILURES) {
                        console.warn('[Docker] Container appears to be stopped - cleaning up session');

                        // Stop the heartbeat timer
                        if (sandbox.heartbeatTimer) clearInterval(sandbox.heartbeatTimer);

                        // Clean up session state
                        session.sandbox = undefined;
                        session.useDocker = false;

                        // Notify UI that Virtual Mode was deactivated
                        session.window.webContents.send('docker:container-stopped', {
                            reason: 'Heartbeat timeout - container unresponsive or stopped',
                            willFallbackToNative: true,
                        });

                        // Broadcast status change
                        session.window.webContents.send('docker:status-changed', {
                            active: false,
                            error: 'Container stopped unexpectedly'
                        });

                        console.log('[Docker] Switched back to Native mode');
                    }
                }
            }, HEARTBEAT_INTERVAL);

            console.log(`[Docker] Created sandbox for window ${session.window.id}: ${instance.id}`);

            // Broadcast status change (success)
            session.window.webContents.send('docker:status-changed', {
                active: true,
                sandbox: {
                    id: instance.id,
                    containerId: instance.containerId,
                    apiPort: instance.apiPort,
                    cdpPort: instance.cdpPort
                }
            });

            return {
                success: true,
                sandbox: {
                    id: instance.id,
                    apiPort: instance.apiPort,
                },
            };
        } catch (error: any) {
            console.error('[Docker] Failed to create sandbox:', error);
            if (session.sandbox?.instance) {
                await dockerManager.destroyInstance(session.sandbox.instance.id);
            }
            // Broadcast status change (failed)
            session.window.webContents.send('docker:status-changed', {
                active: false,
                error: error.message
            });
            return { success: false, error: error.message };
        }
    });

    // Destroy sandbox for a window
    ipcMain.handle('docker:destroy-sandbox', async (event) => {
        const session = getSessionFromEvent(event);
        if (!session?.sandbox) {
            return { success: false, error: 'No sandbox active' };
        }

        try {
            const dockerManager = getDockerManager();

            // Clear heartbeat timer
            if (session.sandbox.heartbeatTimer) {
                clearInterval(session.sandbox.heartbeatTimer);
            }

            await dockerManager.destroyInstance(session.sandbox.instance.id);
            session.sandbox = undefined;
            session.useDocker = false;

            console.log(`[Docker] Destroyed sandbox for window ${session.window.id}`);

            // Broadcast status change
            session.window.webContents.send('docker:status-changed', {
                active: false
            });

            return { success: true };
        } catch (error: any) {
            console.error('[Docker] Failed to destroy sandbox:', error);
            return { success: false, error: error.message };
        }
    });

    // Get sandbox status for a window
    ipcMain.handle('docker:get-sandbox-status', async (event) => {
        const session = getSessionFromEvent(event);
        if (!session?.sandbox) {
            return { active: false };
        }

        try {
            const status = await session.sandbox.client.getStatus();
            return {
                active: true,
                sandbox: {
                    id: session.sandbox.instance.id,
                    cdpPort: session.sandbox.instance.cdpPort,
                    apiPort: session.sandbox.instance.apiPort,
                    vncPort: session.sandbox.instance.vncPort,
                    noVncPort: session.sandbox.instance.noVncPort,
                    status: session.sandbox.instance.status,
                },
                containerStatus: status,
            };
        } catch (error: any) {
            return {
                active: true,
                sandbox: {
                    id: session.sandbox.instance.id,
                    status: 'error',
                },
                error: error.message,
            };
        }
    });

    // Toggle Docker mode for a window
    ipcMain.handle('docker:set-mode', async (event, enabled: boolean) => {
        const session = getSessionFromEvent(event);
        if (!session) {
            return { success: false, error: 'No session found' };
        }

        if (enabled && !session.sandbox) {
            // Need to create sandbox first
            return { success: false, error: 'Create a sandbox first with docker:create-sandbox' };
        }

        session.useDocker = enabled;
        console.log(`[Docker] Window ${session.window.id} Docker mode: ${enabled}`);
        return { success: true, useDocker: session.useDocker };
    });

    // List all active sandboxes
    ipcMain.handle('docker:list-sandboxes', async () => {
        const dockerManager = getDockerManager();
        return dockerManager.listInstances();
    });

    // Check if sandbox image is available
    ipcMain.handle('docker:is-image-available', async () => {
        const dockerManager = getDockerManager();
        if (!await dockerManager.isAvailable()) {
            return { available: false, reason: 'Docker not available' };
        }
        const available = await dockerManager.isImageAvailable();
        return { available };
    });

    // Pull the sandbox image
    ipcMain.handle('docker:pull-image', async () => {
        const dockerManager = getDockerManager();
        if (!await dockerManager.isAvailable()) {
            return { success: false, error: 'Docker not available' };
        }
        try {
            await dockerManager.pullImage();
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    // ==========================================
    // End Docker/Sandbox IPC Handlers
    // ==========================================

    // Codex CLI Authentication - check if ~/.codex/auth.json exists
    ipcMain.handle('codex:is-cli-authenticated', () => {
        return authService.isCodexCliAuthenticated();
    });

    // Track the login process
    let codexLoginProcess: ChildProcess | null = null;

    // Start Codex CLI login
    // 1. Spawn CLI login (it starts server on localhost:1455)
    // 2. Parse the OAuth URL from stderr (CLI prints it as fallback)
    // 3. Navigate app browser to the URL
    // 4. User completes login in app browser (can close external browser)
    // 5. App browser redirects to localhost:1455, CLI receives callback
    // 6. CLI saves auth token automatically
    ipcMain.handle('codex:start-login', async (event) => {
        const senderWindow = BrowserWindow.fromWebContents(event.sender);
        const senderSession = senderWindow ? windowSessions.get(senderWindow.id) : getActiveSession();
        const browserView = senderSession?.tabManager?.getActiveTab()?.browserView || getActiveView();

        // Kill any existing login process
        if (codexLoginProcess) {
            codexLoginProcess.kill();
            codexLoginProcess = null;
        }

        console.log('[Main] Starting Codex CLI login...');

        // Determine Codex CLI path
        const isWindows = process.platform === 'win32';
        const codexBinName = isWindows ? 'codex.cmd' : 'codex';

        let codexBin: string;
        if (app.isPackaged) {
            codexBin = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '.bin', codexBinName);
        } else {
            codexBin = path.join(__dirname, '../../node_modules/.bin', codexBinName);
        }

        console.log('[Main] Using Codex from:', codexBin);

        return new Promise((resolve) => {
            let urlNavigated = false;
            let errorOutput = '';

            // Spawn codex login - it will start server on localhost:1455
            // and attempt to open browser (which we can't prevent on macOS)
            codexLoginProcess = spawn(codexBin, ['login'], {
                shell: false,
                windowsHide: true,
                env: {
                    ...process.env,
                    PYTHONIOENCODING: 'utf-8',
                    PYTHONUTF8: '1',
                    LANG: 'en_US.UTF-8',
                },
            });

            // Parse output for OAuth URL - the CLI outputs it to stderr as a fallback message
            const parseOutput = (data: string, source: 'stdout' | 'stderr') => {
                // Look for the OAuth URL in stderr (CLI prints it as "navigate to this URL")
                // Pattern: https://auth.openai.com/oauth/authorize?...
                const urlMatch = data.match(/https:\/\/auth\.openai\.com\/oauth\/authorize\?[^\s]+/);
                if (urlMatch && !urlNavigated) {
                    const url = urlMatch[0];
                    console.log('[Main] Found OAuth URL in CLI output:', url);

                    if (browserView) {
                        console.log('[Main] Navigating app browser to OAuth URL');
                        browserView.webContents.loadURL(url);
                        senderWindow?.webContents.send('codex:login-url', url);
                        urlNavigated = true;
                    }
                }

                // Also capture any error messages
                if (source === 'stderr' && !data.includes('auth.openai.com')) {
                    errorOutput += data;
                }
            };

            codexLoginProcess.stdout?.on('data', (data: Buffer) => {
                const chunk = data.toString('utf8');
                console.log('[Codex Login stdout]', chunk);
                parseOutput(chunk, 'stdout');
            });

            codexLoginProcess.stderr?.on('data', (data: Buffer) => {
                const chunk = data.toString('utf8');
                console.log('[Codex Login stderr]', chunk);
                parseOutput(chunk, 'stderr');
            });

            codexLoginProcess.on('close', (code) => {
                console.log('[Main] Codex login process exited with code:', code);
                codexLoginProcess = null;

                // Check if auth was successful
                const success = authService.isCodexCliAuthenticated();

                // Extract meaningful error from stderr
                let errorMessage = 'Login was not completed';
                if (errorOutput) {
                    if (errorOutput.includes('429')) {
                        errorMessage = 'Rate limited - please wait a few minutes and try again';
                    } else if (errorOutput.includes('Error')) {
                        const errorMatch = errorOutput.match(/Error[^:]*:\s*(.+)/i);
                        if (errorMatch) {
                            errorMessage = errorMatch[1].trim();
                        }
                    }
                }

                senderWindow?.webContents.send('codex:login-complete', {
                    success,
                    error: success ? undefined : errorMessage
                });

                // Notify UI of auth status change
                // NOTE: Don't call saveToken() here - codex login already wrote valid tokens
                // We just need to reload from the file that CLI wrote
                if (success) {
                    authService.reloadToken();  // Reload from ~/.codex/auth.json that CLI wrote
                    senderWindow?.webContents.send('auth:status-changed', true);

                    // Navigate browser to default page after successful login
                    if (browserView) {
                        console.log('[Main] Login successful, navigating to start page');
                        browserView.webContents.loadURL('https://www.google.com');
                    }
                }
            });

            codexLoginProcess.on('error', (err) => {
                console.error('[Main] Codex login spawn error:', err);
                codexLoginProcess = null;

                senderWindow?.webContents.send('codex:login-complete', {
                    success: false,
                    error: err.message
                });
            });

            // Return immediately - actual result comes via events
            resolve({ success: true });
        });
    });

    // Cancel ongoing login process
    ipcMain.handle('codex:cancel-login', () => {
        if (codexLoginProcess) {
            codexLoginProcess.kill();
            codexLoginProcess = null;
            console.log('[Main] Codex login cancelled');
            return { success: true };
        }
        return { success: false, error: 'No login in progress' };
    });

    // Navigate to URL
    ipcMain.handle('browser:navigate', async (event, url: string) => {
        const browserView = getActiveViewFromEvent(event);
        if (!browserView) return { success: false, error: 'No browser view' };

        try {
            let targetUrl = url;
            if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
                targetUrl = 'https://' + url;
            }
            await browserView.webContents.loadURL(targetUrl);
            return { success: true, url: targetUrl };
        } catch (error) {
            return { success: false, error: String(error) };
        }
    });

    // Go back
    ipcMain.handle('browser:go-back', async () => {
        const browserView = getActiveView();
        if (browserView?.webContents.canGoBack()) {
            browserView.webContents.goBack();
            return { success: true };
        }
        return { success: false, error: 'Cannot go back' };
    });

    // Go forward
    ipcMain.handle('browser:go-forward', async () => {
        const browserView = getActiveView();
        if (browserView?.webContents.canGoForward()) {
            browserView.webContents.goForward();
            return { success: true };
        }
        return { success: false, error: 'Cannot go forward' };
    });

    // Reload
    ipcMain.handle('browser:reload', async () => {
        const browserView = getActiveView();
        browserView?.webContents.reload();
        return { success: true };
    });

    // Get current URL
    ipcMain.handle('browser:get-url', async () => {
        const browserView = getActiveView();
        return browserView?.webContents.getURL() || '';
    });

    // Get page content
    ipcMain.handle('browser:get-content', async () => {
        const browserView = getActiveView();
        if (!browserView) return '';
        try {
            return await browserView.webContents.executeJavaScript('document.body.innerHTML');
        } catch {
            return '';
        }
    });

    // Execute JavaScript in the page
    ipcMain.handle('browser:execute-js', async (_, script: string) => {
        const browserView = getActiveView();
        if (!browserView) return { success: false, error: 'No browser view' };
        try {
            const result = await browserView.webContents.executeJavaScript(script);
            return { success: true, result };
        } catch (error) {
            return { success: false, error: String(error) };
        }
    });

    // Execute Codex CLI with prompt (for user chat)
    ipcMain.handle('codex:execute', async (event, prompt: string, mode: string = 'agent') => {
        console.log('[Main] Executing Codex (chat) in mode:', mode, 'prompt:', prompt.substring(0, 50) + '...');

        // Capture sender window for all output messages
        const senderWindow = BrowserWindow.fromWebContents(event.sender);
        const senderSession = senderWindow ? windowSessions.get(senderWindow.id) : getActiveSession();

        // Kill any existing chat process (but not task processes)
        const existingChatProcess = codexProcesses.get('chat');
        if (existingChatProcess) {
            existingChatProcess.kill();
            codexProcesses.delete('chat');
            // Give a moment for the old Playwright MCP to clean up its CDP connection
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Reset CDP session for the active webview to clear stale Playwright MCP state
        // This fixes "Transport closed" errors on subsequent prompts
        const browserView = senderSession?.tabManager?.getActiveTab()?.browserView || getActiveView();
        if (browserView) {
            try {
                const debugger_ = browserView.webContents.debugger;
                if (debugger_.isAttached()) {
                    console.log('[Main] Detaching debugger to reset CDP session...');
                    debugger_.detach();
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (e) {
                // Debugger might not be attached, that's fine
                console.log('[Main] Debugger reset skipped:', e);
            }
        }

        // Get page snapshot to include in prompt
        let pageContext = '';
        if (browserView) {
            try {
                const url = browserView.webContents.getURL();
                const title = browserView.webContents.getTitle();

                // Get page text content
                const pageContent = await browserView.webContents.executeJavaScript(`
                    (function() {
                        const elements = [];
                        document.querySelectorAll('a, button, input, h1, h2, h3, p, li, span, div').forEach(el => {
                            const text = el.innerText?.trim();
                            if (text && text.length > 0 && text.length < 500) {
                                elements.push(text);
                            }
                        });
                        return [...new Set(elements)].slice(0, 100).join('\\n');
                    })()
                `);

                pageContext = `\n\nCurrent page: ${url}\nTitle: ${title}\n\nPage content:\n${pageContent}\n\n---\nBased on the above page content: `;
            } catch (e) {
                console.log('[Main] Failed to get page snapshot:', e);
            }
        }

        // ========== DOCKER ROUTING ==========
        // If session is in Docker mode with active sandbox, route through container
        if (senderSession?.useDocker && senderSession?.sandbox) {
            console.log('[Main] Routing Codex execution through Docker container...');

            const { settingsService } = require('../core/settings');
            const prePrompt = settingsService.get('codex')?.prePrompt || '';

            const { dataStoreService } = require('../core/datastore');
            const userDataFormatted = dataStoreService.getFormatted();
            const userDataContext = `\n\n## User's Stored Data\nUse this data when the prompt requires personal information:\n${userDataFormatted}\n`;

            // Build full prompt for Docker container
            let fullPrompt = '';
            if (prePrompt) {
                fullPrompt += prePrompt + '\n\n';
            }
            fullPrompt += userDataContext;
            fullPrompt += pageContext;
            fullPrompt += prompt;

            // Return a Promise that uses the callback-based executeCodex API
            return new Promise((resolve) => {
                let output = '';
                let errorOutput = '';

                const abort = senderSession.sandbox!.client.executeCodex(
                    fullPrompt,
                    { mode },  // Don't pass prePrompt - it's already in fullPrompt
                    // onStdout
                    (data: string) => {
                        output += data;
                        console.log('[Docker Codex stdout]', data);
                        // Send with format expected by UI: { type, data }
                        senderWindow?.webContents.send('codex:output', { type: 'stdout', data });

                        // Check for PDS_REQUEST pattern: [PDS_REQUEST:key:message]
                        // Filter out example patterns from documentation (key_name is the example placeholder)
                        const pdsRequestMatch = data.match(/\[PDS_REQUEST:([^:]+):([^\]]+)\]/);
                        if (pdsRequestMatch) {
                            const [, key, message] = pdsRequestMatch;
                            // Skip documentation examples
                            if (key !== 'key_name') {
                                console.log('[Docker Codex] PDS Request detected:', key, message);
                                senderWindow?.webContents.send('codex:pds-request', { key, message });
                            }
                        }
                    },
                    // onStderr
                    // Note: Codex CLI outputs progress info (thinking, tool calls) to stderr
                    // We treat it as output, not error - only actual errors will have error indicators
                    (stderrData: string) => {
                        errorOutput += stderrData;
                        console.log('[Docker Codex stderr]', stderrData);
                        // Send as stderr type - UI will display progress messages
                        senderWindow?.webContents.send('codex:output', { type: 'stderr', data: stderrData });

                        // Also check stderr for PDS_REQUEST (Codex may output to either stream)
                        // Filter out example patterns from documentation (key_name is the example placeholder)
                        const pdsRequestMatch = stderrData.match(/\[PDS_REQUEST:([^:]+):([^\]]+)\]/);
                        if (pdsRequestMatch) {
                            const [, key, message] = pdsRequestMatch;
                            // Skip documentation examples
                            if (key !== 'key_name') {
                                console.log('[Docker Codex] PDS Request detected in stderr:', key, message);
                                senderWindow?.webContents.send('codex:pds-request', { key, message });
                            }
                        }
                    },
                    // onExit
                    (code: number | null) => {
                        console.log('[Docker Codex] Exit code:', code);

                        // Check for auth token errors in output
                        const allOutput = (output + ' ' + errorOutput).toLowerCase();
                        if (code !== 0 && (
                            allOutput.includes('refresh token') ||
                            allOutput.includes('log out and sign in') ||
                            allOutput.includes('sign in again') ||
                            allOutput.includes('token could not be refreshed') ||
                            (allOutput.includes('access token') && allOutput.includes('expired'))
                        )) {
                            // NOTE: Do NOT auto-delete auth.json here!
                            // Docker has read-write access to auth.json and may be refreshing it.
                            // Deleting would create a race condition and invalidate a potentially valid new token.
                            console.log('[Docker Codex] Auth token error detected - notifying UI');

                            // Just notify UI - user can manually re-authenticate if needed
                            senderWindow?.webContents.send('codex:auth-error', {
                                type: 'token_expired',
                                message: 'Authentication failed. Please try again or re-login if the issue persists.'
                            });
                        }

                        // Send complete event with format expected by UI
                        senderWindow?.webContents.send('codex:complete', {
                            code: code ?? 0,
                            output,
                            errorOutput
                        });
                        resolve({ success: code === 0, output, error: errorOutput || undefined });
                    }
                );

                // Store abort function on session for cancellation via codex:stop
                (senderSession as any).dockerAbort = abort;
            });
        }
        // ========== END DOCKER ROUTING ==========

        return new Promise((resolve) => {
            let output = '';
            let errorOutput = '';

            // Get prePrompt from settings
            const { settingsService } = require('../core/settings');
            const prePrompt = settingsService.get('codex')?.prePrompt || '';

            // Get user data from datastore
            const { dataStoreService } = require('../core/datastore');
            const userDataFormatted = dataStoreService.getFormatted();
            const userDataContext = `\n\n## User's Stored Data\nUse this data when the prompt requires personal information:\n${userDataFormatted}\n`;

            // Build mode-specific instructions
            let modeInstructions = '';
            if (mode === 'ask') {
                modeInstructions = `
## MODE: READ-ONLY (Ask)
**You are in READ-ONLY mode. This is a HARD RULE.**

You MUST NOT perform ANY of these actions:
- Click any buttons, links, or interactive elements
- Submit any forms
- Navigate to new pages
- Type into any input fields
- Modify any DOM content
- Use playwright.browser_click, playwright.browser_type, playwright.browser_fill_form, or any action that modifies the page

You CAN ONLY:
- Read and describe page content (use playwright.browser_snapshot)
- Answer questions about what you see
- Explain elements on the page
- Summarize information

If the user asks you to perform an action, politely explain that you are in Read-Only mode and cannot modify the page.

`;
            } else if (mode === 'agent') {
                modeInstructions = `
## MODE: AGENT (Supervised)
Before performing these CRITICAL ACTIONS, you MUST ask for user confirmation first:
- Any payment, checkout, or purchase action
- Final form submissions (submit, confirm, proceed, complete)
- Account changes (delete account, deactivate, change password/email)
- Any action involving money or financial transactions
- Sending messages or emails
- Booking or reservation confirmations

For critical actions, output: "⚠️ This action requires confirmation: [describe action]. Please confirm to proceed."
Then WAIT for user response before continuing.

For non-critical actions (navigation, reading, filling forms without submitting), proceed normally.

`;
            } else if (mode === 'full-access') {
                modeInstructions = `
## MODE: FULL ACCESS (Autonomous)
You have full autonomy to perform any browser action without confirmation.
Execute tasks efficiently and completely without asking for permission.

`;
            }

            // Add tab selection context for multi-window support
            // Use the TabManager's tracked URL (filtered to main frame only) rather than webContents.getURL() 
            // which might return an iframe's URL
            let tabSelectionContext = '';
            const activeTab = senderSession?.tabManager?.getActiveTab();
            const activeTabUrl = activeTab?.url || browserView?.webContents?.getURL();
            if (activeTabUrl && !activeTabUrl.startsWith('file://') && !activeTabUrl.startsWith('about:')) {
                tabSelectionContext = `
## CRITICAL: Tab Selection for Multi-Window
This request is for the browser tab showing: ${activeTabUrl}
Before performing any action, use browser_snapshot to see the "Open tabs" list and ensure you are on the correct tab.
If the current tab URL does not match the expected URL containing "${new URL(activeTabUrl).hostname}", use browser_tab_select to switch to the correct tab first.
Do NOT operate on ad iframe tabs (like onetag-sys.com, doubleclick.net, etc.) - always select the main page tab.
NEVER operate on a tab with a different URL than specified above unless the user explicitly asks to navigate elsewhere.

`;
            } else {
                // FALLBACK: If no active tab context, force Codex to index on "Browser Mode"
                // This prevents "search test" from defaulting to 'rg' (file search) when user means web search
                tabSelectionContext = `
## BROWSER ENVIRONMENT
You are controlling a web browser via Playwright.
If the user asks to "search" or "go to" something, they MEAN WEB SEARCH or WEB NAVIGATION, NOT local file search.
Use 'playwright.browser_navigate' or 'playwright.browser_tabs' to start browsing.
DO NOT use 'rg' (ripgrep) unless the user explicitly asks to search local FILES.

`;
            }

            // Combine: tabSelectionContext + modeInstructions + prePrompt + userDataContext + pageContext + user prompt
            const fullPrompt = tabSelectionContext + modeInstructions + (prePrompt ? prePrompt + userDataContext + '\n\n---\n\n' : '') + pageContext + prompt;

            // Determine Codex CLI path - different for packaged vs development
            const isWindows = process.platform === 'win32';
            const codexBinName = isWindows ? 'codex.cmd' : 'codex';

            let codexBin: string;
            if (app.isPackaged) {
                // Packaged app - use unpacked node_modules
                codexBin = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '.bin', codexBinName);
            } else {
                // Development - use local node_modules
                codexBin = path.join(__dirname, '../../node_modules/.bin', codexBinName);
            }

            console.log('[Main] Using Codex from:', codexBin);

            // Set working directory to session-specific temp dir
            const cwd = getLLMWorkingDir();
            console.log('[Main] Using working directory:', cwd);

            // Get window-specific session info
            const activeSession = getActiveSession();
            const windowId = activeSession?.window.id || 0;

            // Build Codex arguments dynamically
            const codexArgs = ['exec', '--skip-git-repo-check'];

            // Add dynamic Playwright MCP config via -c flag
            // This passes CDP endpoint at runtime without modifying global config.toml
            const extBrowserManager = getExternalBrowserManager();
            const browserStatus = extBrowserManager.getStatus();

            // Use external browser's CDP port if available, otherwise use default (9222)
            // The external browser manager has the current active CDP port
            const cdpPort = browserStatus.cdpPort || 9222;
            const cdpEndpoint = `http://127.0.0.1:${cdpPort}`;

            console.log('[Main] Configuring Playwright MCP with CDP endpoint:', cdpEndpoint);

            // Override mcp_servers.playwright config at runtime
            // Format: -c 'mcp_servers.playwright.args=["@playwright/mcp@latest","--cdp-endpoint","URL"]'
            // Use single quotes for inner strings to ensure safe passing via spawn without shell
            const playwrightArgsValue = `['@playwright/mcp@latest','--cdp-endpoint','${cdpEndpoint}']`;
            codexArgs.push('-c', `mcp_servers.playwright.args=${playwrightArgsValue}`);

            const chatProcess = spawn(codexBin, codexArgs, {
                // Use shell on Windows for .cmd scripts
                shell: isWindows ? true : false,
                cwd,
                // Enable windowsHide to prevent console window popup on Windows
                windowsHide: true,
                env: {
                    ...process.env,
                    // GnuNae window identification for future MCP target isolation
                    GNUNAE_WINDOW_ID: String(windowId),
                    GNUNAE_SESSION_ID: activeSession?.sessionId || '',
                    // UTF-8 encoding for proper Korean/Unicode support
                    PYTHONIOENCODING: 'utf-8',
                    PYTHONUTF8: '1',
                    LANG: 'en_US.UTF-8',
                    // Ensure Windows can find executables
                    ...(isWindows && {
                        ComSpec: process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
                        SystemRoot: process.env.SystemRoot || 'C:\\Windows',
                        // Windows UTF-8 code page
                        CHCP: '65001',
                    }),
                },
            });

            // Handle spawn errors (e.g. binary not found, permission denied, provenance issues)
            chatProcess.on('error', (err) => {
                console.error('[Main] Failed to spawn Codex process:', err);
                senderWindow?.webContents.send('codex:output', {
                    type: 'error',
                    data: `Failed to launch Codex: ${err.message}\nCheck logs for details.`
                });
            });

            // Store in processes map
            codexProcesses.set('chat', chatProcess);

            // Write prompt to stdin
            if (chatProcess.stdin) {
                chatProcess.stdin.write(fullPrompt);
                chatProcess.stdin.end();
            }

            chatProcess.stdout?.on('data', (data: Buffer) => {
                const chunk = data.toString('utf8');
                output += chunk;
                console.log('[Codex stdout]', chunk);

                // Check for PDS_REQUEST pattern: [PDS_REQUEST:([^:]+):([^\]]+)\]/
                // Filter out example patterns from documentation (key_name is the example placeholder)
                const pdsRequestMatch = chunk.match(/\[PDS_REQUEST:([^:]+):([^\]]+)\]/);
                if (pdsRequestMatch) {
                    const [, key, message] = pdsRequestMatch;
                    // Skip documentation examples
                    if (key !== 'key_name') {
                        console.log('[Main] PDS Request detected:', key, message);
                        senderWindow?.webContents.send('codex:pds-request', { key, message });
                    }
                }

                // Also detect [BLOCKER] patterns asking for user data
                // e.g., "[BLOCKER] Waiting for user phone number. What phone number should I use?"
                const blockerMatch = chunk.match(/\[BLOCKER\]\s*(?:Waiting for user\s+)?(.+?)(?:\.|$)/i);
                if (blockerMatch && !pdsRequestMatch) {
                    const blockerText = blockerMatch[1].toLowerCase();
                    // Infer key from blocker message
                    let inferredKey = 'user.info';
                    let message = blockerMatch[0].replace(/\[BLOCKER\]\s*/i, '').trim();

                    if (blockerText.includes('phone')) {
                        inferredKey = 'user.phone';
                    } else if (blockerText.includes('email')) {
                        inferredKey = 'user.email';
                    } else if (blockerText.includes('name')) {
                        inferredKey = 'user.fullname';
                    } else if (blockerText.includes('address')) {
                        inferredKey = 'user.address';
                    } else if (blockerText.includes('resume')) {
                        inferredKey = 'user.resume';
                    } else if (blockerText.includes('salary') || blockerText.includes('compensation')) {
                        inferredKey = 'user.salary';
                    }

                    // Extract the question part if present
                    const questionMatch = chunk.match(/(?:What|Please provide|Enter|I need)\s+.+\?/i);
                    if (questionMatch) {
                        message = questionMatch[0];
                    }

                    console.log('[Main] BLOCKER as PDS Request detected:', inferredKey, message);
                    senderWindow?.webContents.send('codex:pds-request', { key: inferredKey, message });
                }

                // Check for PDS_STORE pattern: [PDS_STORE:([^:]+):([^\]]+)\]/g
                // Can have multiple stores in one chunk
                const pdsStoreRegex = /\[PDS_STORE:([^:]+):([^\]]+)\]/g;
                let storeMatch;
                while ((storeMatch = pdsStoreRegex.exec(chunk)) !== null) {
                    const [fullMatch, key, value] = storeMatch;
                    console.log('[Main] PDS Store detected:', key, value);

                    // Save to datastore
                    const { dataStoreService } = require('../core/datastore');
                    dataStoreService.set(key, value);

                    // Notify renderer of the store operation
                    senderWindow?.webContents.send('codex:pds-stored', { key, value });
                }

                // Check for CAPTCHA/2FA/login block patterns
                const lowerChunk = chunk.toLowerCase();
                const blockPatterns = [
                    { pattern: 'captcha', type: 'captcha' },
                    { pattern: 'recaptcha', type: 'captcha' },
                    { pattern: 'hcaptcha', type: 'captcha' },
                    { pattern: 'verify you are human', type: 'captcha' },
                    { pattern: 'robot', type: 'captcha' },
                    { pattern: 'two-factor', type: '2fa' },
                    { pattern: '2fa', type: '2fa' },
                    { pattern: 'verification code', type: '2fa' },
                    { pattern: 'authenticator', type: '2fa' },
                    { pattern: 'security code', type: '2fa' },
                    { pattern: 'one-time password', type: '2fa' },
                    { pattern: 'otp', type: '2fa' },
                    { pattern: 'login required', type: 'login' },
                    { pattern: 'sign in required', type: 'login' },
                    { pattern: 'please log in', type: 'login' },
                    { pattern: 'session expired', type: 'login' },
                    { pattern: 'access denied', type: 'blocked' },
                    { pattern: 'blocked', type: 'blocked' },
                ];

                for (const { pattern, type } of blockPatterns) {
                    if (lowerChunk.includes(pattern)) {
                        console.log(`[Main] Block detected: ${type} (pattern: ${pattern})`);
                        senderWindow?.webContents.send('task:blocked', {
                            type,
                            reason: `Access blocked by ${type} check`,
                            pattern,
                        });
                        break; // Only report first match
                    }
                }

                // Send chunk to renderer
                senderWindow?.webContents.send('codex:output', { type: 'stdout', data: chunk });
            });

            chatProcess.stderr?.on('data', (data: Buffer) => {
                const chunk = data.toString('utf8');
                errorOutput += chunk;
                console.log('[Codex stderr]', chunk);
                senderWindow?.webContents.send('codex:output', { type: 'stderr', data: chunk });
            });

            chatProcess.on('close', (code) => {
                console.log('[Main] Codex process exited with code:', code);

                // Combine output and error for pattern matching
                const allOutput = (output + ' ' + errorOutput).toLowerCase();

                // Check for common issues and provide helpful messages
                if (code !== 0) {
                    let helpMessage = '';

                    // Free user / subscription required
                    if (allOutput.includes('subscription') ||
                        allOutput.includes('upgrade') ||
                        allOutput.includes('pro') ||
                        allOutput.includes('plus') ||
                        allOutput.includes('billing') ||
                        allOutput.includes('payment') ||
                        allOutput.includes('insufficient_quota') ||
                        allOutput.includes('rate_limit') ||
                        allOutput.includes('exceeded')) {
                        helpMessage = '⚠️ ChatGPT Pro/Plus subscription required.\n\nCodex CLI is only available to ChatGPT Pro or Plus subscribers. Please upgrade your OpenAI account at:\nhttps://chat.openai.com/settings/subscription';
                    }
                    // Model access denied
                    else if (allOutput.includes('model') && (allOutput.includes('access') || allOutput.includes('permission') || allOutput.includes('denied'))) {
                        helpMessage = '⚠️ Model access denied.\n\nYour OpenAI account does not have access to the required models. ChatGPT Pro/Plus subscription is required.';
                    }
                    // Authentication issues - token expired or refresh failed
                    else if (allOutput.includes('refresh token') ||
                        allOutput.includes('log out and sign in') ||
                        allOutput.includes('sign in again') ||
                        allOutput.includes('token could not be refreshed') ||
                        allOutput.includes('access token') && allOutput.includes('expired')) {

                        // NOTE: Do NOT auto-delete auth.json - CLI may be refreshing it.
                        console.log('[Codex] Auth token error detected - notifying UI');

                        helpMessage = '⚠️ OpenAI session expired.\n\nPlease re-authenticate using the Codex login.';

                        // Notify UI of auth error
                        senderWindow?.webContents.send('codex:auth-error', {
                            type: 'token_expired',
                            message: 'Authentication failed. Please try again or re-login if the issue persists.'
                        });
                    }
                    // Other authentication issues
                    else if (allOutput.includes('openai_api_key') ||
                        allOutput.includes('authentication') ||
                        allOutput.includes('unauthorized') ||
                        allOutput.includes('invalid_api_key') ||
                        allOutput.includes('401')) {
                        helpMessage = '⚠️ OpenAI authentication failed.\n\nRun "codex auth openai" in terminal to authenticate.';
                    }
                    // No output at all - likely not configured
                    else if (!output && !errorOutput) {
                        helpMessage = '⚠️ Codex failed to start.\n\n1. Make sure you have a ChatGPT Pro/Plus subscription\n2. Run "codex auth openai" in terminal to authenticate';
                    }

                    if (helpMessage) {
                        senderWindow?.webContents.send('codex:output', {
                            type: 'stderr',
                            data: helpMessage
                        });
                    }
                }

                senderWindow?.webContents.send('codex:complete', { code, output, errorOutput });
                codexProcesses.delete('chat');
                resolve({ success: code === 0, output, errorOutput, code });
            });

            chatProcess.on('error', (err) => {
                console.error('[Main] Codex spawn error:', err);

                // Provide helpful error message
                let userMessage = err.message;
                if (err.message.includes('ENOENT') || err.message.includes('not found')) {
                    userMessage = '⚠️ Codex CLI not found. Please ensure @openai/codex is installed.';
                }

                senderWindow?.webContents.send('codex:error', { error: userMessage });
                codexProcesses.delete('chat');
                resolve({ success: false, error: userMessage });
            });
        });
    });

    // Stop running Codex process (chat)
    ipcMain.handle('codex:stop', async (event) => {
        // First, try to stop Docker execution if active
        const senderWindow = BrowserWindow.fromWebContents(event.sender);
        const senderSession = senderWindow ? windowSessions.get(senderWindow.id) : getActiveSession();

        if (senderSession?.sandbox && (senderSession as any).dockerAbort) {
            console.log('[Main] Stop requested for Docker execution');
            try {
                // Call the stored abort function
                (senderSession as any).dockerAbort();
                (senderSession as any).dockerAbort = null;

                // Also call the API to stop Codex in container
                await senderSession.sandbox.client.stopCodex();
                console.log('[Main] Docker Codex stopped');
                return { success: true };
            } catch (e) {
                console.error('[Main] Error stopping Docker Codex:', e);
                // Continue to try local process stop as fallback
            }
        }

        const chatProcess = codexProcesses.get('chat');
        console.log('[Main] Stop requested, chatProcess:', !!chatProcess);
        if (chatProcess) {
            try {
                const isWindows = process.platform === 'win32';
                const pid = chatProcess.pid;

                if (isWindows && pid) {
                    // On Windows, use taskkill to kill the entire process tree
                    // /T = tree kill, /F = force
                    const { execSync } = require('child_process');
                    try {
                        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
                        console.log('[Main] Process tree killed via taskkill');
                    } catch (e) {
                        // taskkill might fail if process already exited
                        console.log('[Main] taskkill error (process may have already exited):', e);
                    }
                } else {
                    // Graceful termination on Unix
                    chatProcess.kill('SIGTERM');
                    // Force kill after timeout if still running
                    const proc = chatProcess;
                    setTimeout(() => {
                        if (proc && !proc.killed) {
                            proc.kill('SIGKILL');
                        }
                    }, 1000);
                }

                codexProcesses.delete('chat');
                console.log('[Main] Chat process killed');
                return { success: true };
            } catch (e) {
                console.error('[Main] Error killing process:', e);
                codexProcesses.delete('chat');
                return { success: true }; // Still consider it stopped
            }
        }
        return { success: false, error: 'No running process' };
    });

    // Respond to PDS request - save to datastore and feed to Codex
    ipcMain.handle('codex:pds-respond', async (_, key: string, value: string) => {
        console.log('[Main] PDS Response:', key, value);

        // Save to datastore
        const { dataStoreService } = require('../core/datastore');
        dataStoreService.set(key, value);

        // Feed value back to Codex stdin if chat process is running
        const chatProcess = codexProcesses.get('chat');
        if (chatProcess && chatProcess.stdin) {
            const response = `\n[PDS_VALUE:${key}=${value}]\n`;
            chatProcess.stdin.write(response);
            console.log('[Main] Fed PDS value to Codex:', response);
        }

        return { success: true };
    });
}

app.whenReady().then(async () => {
    // Ensure Codex is configured with Playwright MCP
    ensurePlaywrightMcpConfig();

    createMenu();

    // Register IPC handlers first (before any windows are created)
    setupIpcHandlers();
    setupExternalBrowserIpcHandlers();

    // Initialize browser detection
    const externalBrowserMgr = getExternalBrowserManager();
    await externalBrowserMgr.initialize();

    // Initialize tray manager
    trayManager = new TrayManager({
        onShowWindow: () => {
            const win = getMainWindow();
            if (win) {
                win.show();
                win.focus();
            }
            trayManager?.setWindowVisible(true);
        },
        onHideWindow: () => {
            const win = getMainWindow();
            if (win) {
                win.hide();
            }
            trayManager?.setWindowVisible(false);
        },
        onQuit: () => {
            // Force quit - don't minimize to tray
            app.quit();
        },
        onOpenSettings: () => {
            // Open standalone settings window (works in both normal and chat mode)
            createSettingsWindow();
        },
        onExternalBrowserLaunch: async (browserId: string) => {
            console.log('[Main] Tray: launching external browser:', browserId);
            const result = await externalBrowserMgr.launchBrowser(browserId);
            if (!result.success) {
                dialog.showErrorBox('Browser Launch Failed', result.error || 'Unknown error');
            }
        },
        getDetectedBrowsers: async () => {
            return externalBrowserMgr.getDetectedBrowsers().map(b => ({
                id: b.id,
                name: b.name,
            }));
        },
    });
    await trayManager.initialize();

    // Handle hidden mode / chat mode from command line
    console.log('[Main] Checking startup mode - hidden:', cliArgs.hidden, 'chatMode:', cliArgs.chatMode, 'externalBrowser:', cliArgs.externalBrowser);
    if (cliArgs.hidden || cliArgs.chatMode) {
        console.log('[Main] Starting in', cliArgs.chatMode ? 'chat mode' : 'hidden mode');

        // If external browser specified, launch it first
        if (cliArgs.externalBrowser) {
            console.log('[Main] Detected browsers:', externalBrowserMgr.getDetectedBrowsers().map(b => `${b.id}:${b.name}`).join(', '));
            console.log('[Main] Launching external browser:', cliArgs.externalBrowser);
            const result = await externalBrowserMgr.launchBrowser(cliArgs.externalBrowser);
            console.log('[Main] Launch result:', JSON.stringify(result));
            if (!result.success) {
                console.error('[Main] Failed to launch external browser:', result.error);
                trayManager.showNotification(
                    'Browser Launch Failed',
                    result.error || 'Could not launch the external browser'
                );
                // Fall back to normal window if browser launch fails
                createWindow();
            } else {
                // Browser launched successfully
                const browserInfo = externalBrowserMgr.getBrowser(cliArgs.externalBrowser);
                const browserName = browserInfo?.name || cliArgs.externalBrowser;
                console.log('[Main] Browser launched successfully:', browserName);

                if (cliArgs.chatMode) {
                    console.log('[Main] Creating chat window for:', browserName);
                    // Chat mode: create chat-only window
                    const chatWin = createChatWindow({
                        browserName,
                        browserId: cliArgs.externalBrowser,
                    });

                    // If Virtual Mode is enabled, create Docker sandbox for chat window
                    const settings = settingsService.getAll();
                    console.log('[Main] Chat mode - Virtual Mode setting:', settings.docker?.useVirtualMode);
                    if (settings.docker?.useVirtualMode) {
                        const chatSession = windowSessions.get(chatWin.id);
                        console.log('[Main] Chat session found:', !!chatSession);
                        if (chatSession) {
                            try {
                                const dockerManager = getDockerManager();

                                // Initialize Docker manager first
                                console.log('[Main] Initializing Docker manager for chat mode...');
                                const dockerReady = await dockerManager.initialize();
                                if (!dockerReady) {
                                    console.error('[Main] Docker manager failed to initialize');
                                    throw new Error('Docker not available');
                                }

                                // Verify CDP is responding before creating Docker sandbox
                                const cdpStatus = externalBrowserMgr.getStatus();
                                console.log('[Main] Verifying CDP connection on port:', cdpStatus.cdpPort);

                                // Wait a bit for browser to fully initialize CDP
                                await new Promise(resolve => setTimeout(resolve, 2000));

                                const cdpPort = cdpStatus.cdpPort || 9223;
                                const externalCdpEndpoint = `http://host.docker.internal:${cdpPort}`;

                                console.log('[Main] Creating Docker sandbox for chat mode with CDP:', externalCdpEndpoint);
                                const sandboxResult = await dockerManager.createInstance({
                                    name: `gnunae-chat-${chatWin.id}`,
                                    browserMode: 'external-cdp',
                                    externalCdpEndpoint,
                                });

                                const sandboxClient = createSandboxClient({
                                    apiPort: sandboxResult.apiPort,
                                    cdpPort: sandboxResult.cdpPort,
                                });
                                chatSession.sandbox = {
                                    instance: sandboxResult,
                                    client: sandboxClient,
                                };
                                chatSession.useDocker = true;
                                console.log('[Main] Chat mode Docker sandbox created successfully');
                            } catch (err) {
                                console.warn('[Main] Failed to create Docker sandbox for chat mode:', err);
                            }
                        }
                    }
                } else {
                    // Hidden mode without chat: create hidden window
                    createWindow();
                    const win = getMainWindow();
                    if (win) {
                        win.hide();
                    }
                    trayManager.setWindowVisible(false);
                }
            }
        } else {
            // No external browser - just create hidden window
            createWindow();
            const win = getMainWindow();
            if (win) {
                win.hide();
            }
            trayManager.setWindowVisible(false);
        }
    } else {
        // Normal startup - show window
        createWindow();
    }

    startTaskScheduler();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        } else {
            // On macOS, show the window when clicking dock icon
            const win = getMainWindow();
            if (win) {
                win.show();
                win.focus();
            }
        }
    });
});

/**
 * Setup IPC handlers for external browser and shortcut functionality
 */
function setupExternalBrowserIpcHandlers(): void {
    const externalBrowserMgr = getExternalBrowserManager();

    // Detect installed browsers
    ipcMain.handle('external-browser:detect', async () => {
        await externalBrowserMgr.initialize();
        return externalBrowserMgr.getDetectedBrowsers();
    });

    // Launch external browser
    ipcMain.handle('external-browser:launch', async (_, browserId: string) => {
        const result = await externalBrowserMgr.launchBrowser(browserId);
        return result;
    });

    // Close external browser session
    ipcMain.handle('external-browser:close', async () => {
        return externalBrowserMgr.closeSession();
    });

    // Get external browser status
    ipcMain.handle('external-browser:status', () => {
        return externalBrowserMgr.getStatus();
    });

    // Create browser shortcut
    ipcMain.handle('shortcut:create', async (_, browserId: string, browserName: string, locations: ShortcutLocation[]) => {
        // Get browser-specific icon (chrome.png, edge.png, etc.)
        const iconPath = shortcutManager.getBrowserIcon(browserId);

        const results = await shortcutManager.createShortcuts({
            browserId,
            browserName,
            locations,
            iconPath,  // Use browser-specific icon
        });

        // Update settings with created shortcut
        const settings = settingsService.getAll();
        const shortcuts = settings.externalBrowsers?.shortcuts || [];
        const existingIdx = shortcuts.findIndex(s => s.browserId === browserId);

        const shortcutRecord = {
            browserId,
            browserName,
            shortcutLocations: locations,
            created: results.some(r => r.success),
            createdAt: new Date().toISOString(),
        };

        if (existingIdx >= 0) {
            shortcuts[existingIdx] = shortcutRecord;
        } else {
            shortcuts.push(shortcutRecord);
        }

        settingsService.update({
            externalBrowsers: {
                ...settings.externalBrowsers,
                shortcuts,
            },
        });

        return results;
    });

    // Remove browser shortcut
    ipcMain.handle('shortcut:remove', async (_, browserId: string) => {
        const settings = settingsService.getAll();
        const shortcut = settings.externalBrowsers?.shortcuts?.find(s => s.browserId === browserId);

        if (shortcut) {
            const results = await shortcutManager.removeShortcuts(browserId, shortcut.shortcutLocations);

            // Update settings
            const shortcuts = settings.externalBrowsers?.shortcuts?.filter(s => s.browserId !== browserId) || [];
            settingsService.update({
                externalBrowsers: {
                    ...settings.externalBrowsers,
                    shortcuts,
                },
            });

            return results;
        }

        return [{ success: true, location: 'desktop' as ShortcutLocation }];
    });

    // Get created shortcuts
    ipcMain.handle('shortcut:list', () => {
        const settings = settingsService.getAll();
        return settings.externalBrowsers?.shortcuts || [];
    });

    // Get available shortcut locations for platform
    ipcMain.handle('shortcut:locations', () => {
        return shortcutManager.getAvailableLocations().map(loc => ({
            id: loc,
            label: shortcutManager.getLocationLabel(loc),
        }));
    });

    // Open standalone settings window (for chat mode)
    ipcMain.handle('settings:open-standalone', () => {
        createSettingsWindow();
        return { success: true };
    });
}

// Task Scheduler: checks for due scheduled tasks every minute
function startTaskScheduler(): void {
    const CHECK_INTERVAL_MS = 60 * 1000; // 1 minute

    console.log('[Scheduler] Starting task scheduler...');

    setInterval(async () => {
        try {
            const { taskService } = require('../core/tasks');

            // Skip if a task is already running
            if (taskService.isTaskRunning()) {
                return;
            }

            // Get due scheduled tasks
            const dueTasks = taskService.getScheduledTasksDue();
            if (dueTasks.length === 0) {
                return;
            }

            // Run the first due task
            const task = dueTasks[0];
            console.log(`[Scheduler] Running scheduled task: ${task.name}`);

            // Mark as running
            taskService.setTaskRunning(task.id);
            taskService.markScheduledTaskRun(task.id);

            const promptToUse = task.optimizedPrompt || task.originalPrompt;
            const modeToUse = task.mode || 'agent';
            const startUrl = task.startUrl;

            // Emit to UI to execute
            mainWindow?.webContents.send('task:started', { taskId: task.id, name: task.name });
            mainWindow?.webContents.send('task:execute-prompt', {
                taskId: task.id,
                prompt: promptToUse,
                mode: modeToUse,
                name: task.name,
                startUrl,
                triggerType: 'scheduled',
                useNewTab: true
            });
        } catch (error) {
            console.error('[Scheduler] Error checking scheduled tasks:', error);
        }
    }, CHECK_INTERVAL_MS);
}

app.on('window-all-closed', () => {
    // Check if we should stay running in background (tray mode)
    const settings = settingsService.getAll();
    const runInBackground = settings.app?.runInBackground || cliArgs.hidden;

    if (runInBackground) {
        // Keep running - user can access via tray icon
        console.log('[Main] All windows closed, staying in background (tray mode)');
        return;
    }

    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Cleanup all session temp directories on quit
app.on('will-quit', async () => {
    // Close external browser session
    try {
        const externalBrowserMgr = getExternalBrowserManager();
        await externalBrowserMgr.closeSession();
        console.log('[Main] External browser session closed');
    } catch (err) {
        console.error('[Main] External browser cleanup error:', err);
    }

    // Destroy tray manager
    if (trayManager) {
        trayManager.destroy();
        trayManager = null;
    }

    // Shutdown Docker manager (destroys all sandboxes)
    try {
        const dockerManager = getDockerManager();
        await dockerManager.shutdown();
        console.log('[Main] Docker manager shutdown complete');
    } catch (err) {
        console.error('[Main] Docker manager shutdown error:', err);
    }

    // Collect all work directories to clean up
    const dirsToClean = new Set<string>();
    windowSessions.forEach(session => {
        if (session.workDir && session.workDir.includes(os.tmpdir())) {
            dirsToClean.add(session.workDir);
        }
    });

    dirsToClean.forEach(sessionDir => {
        if (fs.existsSync(sessionDir)) {
            try {
                fs.rmSync(sessionDir, { recursive: true, force: true });
                console.log('[Main] Cleaned up session temp directory:', sessionDir);
            } catch (err) {
                console.error('[Main] Failed to cleanup session temp:', err);
            }
        }
    });
});

// Emergency cleanup on crash - use synchronous commands to ensure cleanup
const emergencyDockerCleanup = () => {
    console.log('[Main] Emergency Docker cleanup triggered');
    try {
        const runtime = 'docker'; // Could detect from runtime-detector
        // Kill all gnunae containers synchronously
        const { spawnSync } = require('child_process');
        const result = spawnSync(runtime, [
            'ps', '-q', '--filter', 'name=gnunae-'
        ], { encoding: 'utf8' });

        const containerIds = (result.stdout || '').trim().split('\n').filter(Boolean);
        if (containerIds.length > 0) {
            console.log('[Main] Stopping containers:', containerIds);
            spawnSync(runtime, ['stop', ...containerIds], { timeout: 5000 });
        }
    } catch (err) {
        console.error('[Main] Emergency cleanup error:', err);
    }
};

// Handle crashes and unexpected exits
process.on('uncaughtException', (err) => {
    console.error('[Main] Uncaught exception:', err);
    emergencyDockerCleanup();
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('[Main] Unhandled rejection:', reason);
});

// Also cleanup on SIGTERM/SIGINT (e.g., macOS force quit)
process.on('SIGTERM', () => {
    console.log('[Main] SIGTERM received');
    emergencyDockerCleanup();
    app.quit();
});

process.on('SIGINT', () => {
    console.log('[Main] SIGINT received');
    emergencyDockerCleanup();
    app.quit();
});
