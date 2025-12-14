import { app, BrowserWindow, BrowserView, ipcMain, session } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { AuthService } from '../core/auth';
import { startMcpServer, updateBrowserView } from './mcp-server';

let codexProcess: ChildProcess | null = null;

let mainWindow: BrowserWindow | null = null;
let browserView: BrowserView | null = null;
let authService: AuthService;

const SIDEBAR_WIDTH = 380;
const TOPBAR_HEIGHT = 50;

// OpenAI/ChatGPT OAuth URLs
const OPENAI_AUTH_URL = 'https://chatgpt.com/auth/login';
const CHATGPT_DOMAIN = 'chatgpt.com';

function createWindow(): void {
    // Initialize auth service
    authService = new AuthService();

    // Create the main window
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 15, y: 15 },
    });

    // Create the BrowserView for web content
    browserView = new BrowserView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    });

    mainWindow.setBrowserView(browserView);
    updateLayout();

    // Start MCP server for Codex to control this BrowserView
    startMcpServer(browserView);

    // Load the UI
    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(path.join(__dirname, '../ui/index.html'));
    }

    // Uncomment to debug: mainWindow.webContents.openDevTools({ mode: 'detach' });

    // Check auth and load appropriate page
    if (authService.isAuthenticated()) {
        // User is authenticated, load default page
        browserView.webContents.loadURL('https://www.google.com');
    } else {
        // User not authenticated, load login page
        browserView.webContents.loadFile(path.join(__dirname, '../ui/login.html'));
    }

    // Handle resize
    mainWindow.on('resize', updateLayout);

    // Track URL changes and detect successful login
    browserView.webContents.on('did-navigate', async (_, url) => {
        console.log('[Main] Navigated to:', url);
        mainWindow?.webContents.send('browser:url-updated', url);

        // Check if user landed on ChatGPT main page (not auth pages)
        if (url.includes(CHATGPT_DOMAIN) && !url.includes('/auth')) {
            console.log('[Main] On ChatGPT, checking auth...');
            const success = await authService.extractTokenFromCookies(browserView!.webContents.session);
            if (success) {
                console.log('[Main] Auth successful, notifying UI');
                mainWindow?.webContents.send('auth:status-changed', true);
            }
        }
    });

    // Also check on page finish loading (catches SPA navigations)
    browserView.webContents.on('did-finish-load', async () => {
        const url = browserView?.webContents.getURL() || '';
        if (url.includes(CHATGPT_DOMAIN) && !url.includes('/auth')) {
            console.log('[Main] Page finished loading on ChatGPT, checking auth...');
            const success = await authService.extractTokenFromCookies(browserView!.webContents.session);
            if (success && !authService.isAuthenticated()) {
                // Re-load to get fresh state
            }
            if (success) {
                mainWindow?.webContents.send('auth:status-changed', true);
            }
        }
    });

    browserView.webContents.on('did-navigate-in-page', (_, url) => {
        mainWindow?.webContents.send('browser:url-updated', url);
    });

    // Track page title changes
    browserView.webContents.on('page-title-updated', (_, title) => {
        mainWindow?.webContents.send('browser:title-updated', title);
    });

    // Track loading state
    browserView.webContents.on('did-start-loading', () => {
        mainWindow?.webContents.send('browser:loading', true);
    });

    browserView.webContents.on('did-stop-loading', () => {
        mainWindow?.webContents.send('browser:loading', false);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        browserView = null;
    });
}

function updateLayout(): void {
    if (!mainWindow || !browserView) return;

    const bounds = mainWindow.getBounds();
    const contentBounds = mainWindow.getContentBounds();

    browserView.setBounds({
        x: 0,
        y: TOPBAR_HEIGHT,
        width: contentBounds.width - SIDEBAR_WIDTH,
        height: contentBounds.height - TOPBAR_HEIGHT,
    });
}

// IPC Handlers
function setupIpcHandlers(): void {
    // UI handlers - toggle BrowserView for overlays
    ipcMain.handle('ui:hide-browser', () => {
        if (browserView && mainWindow) {
            mainWindow.removeBrowserView(browserView);
        }
        return { success: true };
    });

    ipcMain.handle('ui:show-browser', () => {
        if (browserView && mainWindow) {
            mainWindow.setBrowserView(browserView);
            updateLayout();
        }
        return { success: true };
    });

    // Auth handlers
    ipcMain.handle('auth:is-authenticated', () => {
        return authService.isAuthenticated();
    });

    ipcMain.handle('auth:get-user', () => {
        return authService.getEmail();
    });

    ipcMain.handle('auth:start-google-login', async () => {
        if (!browserView) return { success: false };

        // Navigate to OpenAI login page which offers Google sign-in
        await browserView.webContents.loadURL(OPENAI_AUTH_URL);
        return { success: true };
    });

    ipcMain.handle('auth:logout', async () => {
        authService.clearToken();

        // Clear cookies
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
        browserView?.webContents.loadFile(path.join(__dirname, '../ui/login.html'));
        return { success: true };
    });

    // Manual auth check - called by UI when it suspects user might be logged in
    ipcMain.handle('auth:check-now', async () => {
        if (!browserView) return { authenticated: false };
        console.log('[Main] Manual auth check requested');
        const success = await authService.extractTokenFromCookies(browserView.webContents.session);
        return { authenticated: success };
    });

    // Navigate to URL
    ipcMain.handle('browser:navigate', async (_, url: string) => {
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
        if (browserView?.webContents.canGoBack()) {
            browserView.webContents.goBack();
            return { success: true };
        }
        return { success: false, error: 'Cannot go back' };
    });

    // Go forward
    ipcMain.handle('browser:go-forward', async () => {
        if (browserView?.webContents.canGoForward()) {
            browserView.webContents.goForward();
            return { success: true };
        }
        return { success: false, error: 'Cannot go forward' };
    });

    // Reload
    ipcMain.handle('browser:reload', async () => {
        browserView?.webContents.reload();
        return { success: true };
    });

    // Get current URL
    ipcMain.handle('browser:get-url', async () => {
        return browserView?.webContents.getURL() || '';
    });

    // Get page content
    ipcMain.handle('browser:get-content', async () => {
        if (!browserView) return '';
        try {
            return await browserView.webContents.executeJavaScript('document.body.innerHTML');
        } catch {
            return '';
        }
    });

    // Execute JavaScript in the page
    ipcMain.handle('browser:execute-js', async (_, script: string) => {
        if (!browserView) return { success: false, error: 'No browser view' };
        try {
            const result = await browserView.webContents.executeJavaScript(script);
            return { success: true, result };
        } catch (error) {
            return { success: false, error: String(error) };
        }
    });

    // Execute Codex CLI with prompt
    ipcMain.handle('codex:execute', async (_, prompt: string) => {
        console.log('[Main] Executing Codex with prompt:', prompt.substring(0, 50) + '...');

        // Kill any existing Codex process
        if (codexProcess) {
            codexProcess.kill();
            codexProcess = null;
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

        return new Promise((resolve) => {
            let output = '';
            let errorOutput = '';

            const fullPrompt = pageContext + prompt;

            // Use local Codex CLI from node_modules with app's config
            const codexBin = path.join(__dirname, '../../node_modules/.bin/codex');
            const codexConfig = path.join(__dirname, '../../config/codex.toml');

            codexProcess = spawn(codexBin, ['exec'], {
                shell: true,
                cwd: path.join(__dirname, '../..'),
                env: {
                    ...process.env,
                    PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin',
                    CODEX_CONFIG: codexConfig,
                },
            });

            // Write prompt to stdin
            if (codexProcess.stdin) {
                codexProcess.stdin.write(fullPrompt);
                codexProcess.stdin.end();
            }

            codexProcess.stdout?.on('data', (data: Buffer) => {
                const chunk = data.toString();
                output += chunk;
                console.log('[Codex stdout]', chunk);
                // Send streaming output to renderer
                mainWindow?.webContents.send('codex:output', { type: 'stdout', data: chunk });
            });

            codexProcess.stderr?.on('data', (data: Buffer) => {
                const chunk = data.toString();
                errorOutput += chunk;
                console.log('[Codex stderr]', chunk);
                mainWindow?.webContents.send('codex:output', { type: 'stderr', data: chunk });
            });

            codexProcess.on('close', (code) => {
                console.log('[Main] Codex process exited with code:', code);
                mainWindow?.webContents.send('codex:complete', { code, output, errorOutput });
                codexProcess = null;
                resolve({ success: code === 0, output, errorOutput, code });
            });

            codexProcess.on('error', (err) => {
                console.error('[Main] Codex spawn error:', err);
                mainWindow?.webContents.send('codex:error', { error: err.message });
                codexProcess = null;
                resolve({ success: false, error: err.message });
            });
        });
    });

    // Stop running Codex process
    ipcMain.handle('codex:stop', async () => {
        if (codexProcess) {
            codexProcess.kill();
            codexProcess = null;
            return { success: true };
        }
        return { success: false, error: 'No running process' };
    });
}

app.whenReady().then(() => {
    createWindow();
    setupIpcHandlers();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
