import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Tab info type
export interface TabInfo {
    id: string;
    url: string;
    title: string;
    isActive: boolean;
}

// Type definitions for the exposed API
export interface ElectronAPI {
    // Auth
    isAuthenticated: () => Promise<boolean>;
    getUser: () => Promise<string | null>;
    startGoogleLogin: () => Promise<{ success: boolean }>;
    logout: () => Promise<{ success: boolean }>;
    showLogin: () => Promise<{ success: boolean }>;
    checkNow: () => Promise<{ authenticated: boolean }>;
    onAuthStatusChanged: (callback: (authenticated: boolean) => void) => () => void;

    // UI
    hideBrowser: () => Promise<{ success: boolean }>;
    showBrowser: () => Promise<{ success: boolean }>;

    // Tabs
    createTab: (url?: string) => Promise<{ success: boolean; tabId?: string }>;
    closeTab: (tabId: string) => Promise<{ success: boolean }>;
    switchTab: (tabId: string) => Promise<{ success: boolean }>;
    getTabs: () => Promise<TabInfo[]>;
    getActiveTab: () => Promise<string | null>;
    onTabsUpdated: (callback: (tabs: TabInfo[]) => void) => () => void;

    // DataStore
    getDataStore: () => Promise<Record<string, string | number | boolean>>;
    getDataStoreValue: (key: string) => Promise<string | number | boolean | undefined>;
    setDataStoreValue: (key: string, value: string | number | boolean) => Promise<{ success: boolean }>;
    removeDataStoreValue: (key: string) => Promise<{ success: boolean }>;

    // Browser navigation
    navigate: (url: string) => Promise<{ success: boolean; url?: string; error?: string }>;
    goBack: () => Promise<{ success: boolean; error?: string }>;
    goForward: () => Promise<{ success: boolean; error?: string }>;
    reload: () => Promise<{ success: boolean }>;
    getUrl: () => Promise<string>;
    getContent: () => Promise<string>;
    executeJs: (script: string) => Promise<{ success: boolean; result?: any; error?: string }>;

    // Codex CLI
    executeCodex: (prompt: string, mode?: string) => Promise<{ success: boolean; output?: string; errorOutput?: string; error?: string }>;
    stopCodex: () => Promise<{ success: boolean }>;
    respondPdsRequest: (key: string, value: string) => Promise<{ success: boolean }>;
    onCodexOutput: (callback: (data: { type: string; data: string }) => void) => () => void;
    onCodexComplete: (callback: (data: { code: number; output: string; errorOutput: string }) => void) => () => void;
    onCodexError: (callback: (data: { error: string }) => void) => () => void;
    onPdsRequest: (callback: (data: { key: string; message: string }) => void) => () => void;
    onPdsStored: (callback: (data: { key: string; value: string }) => void) => () => void;
    onTaskBlocked: (callback: (data: { type: string; message: string; detail: string }) => void) => () => void;

    // Codex CLI Authentication
    startCodexLogin: () => Promise<{ success: boolean; error?: string }>;
    cancelCodexLogin: () => Promise<{ success: boolean }>;
    isCodexCliAuthenticated: () => Promise<boolean>;
    onCodexLoginUrl: (callback: (url: string) => void) => () => void;
    onCodexLoginComplete: (callback: (data: { success: boolean; error?: string }) => void) => () => void;
    onCodexDeviceCode: (callback: (code: string) => void) => () => void;
    onTriggerCodexLogin: (callback: () => void) => () => void;

    // Docker/Sandbox
    isDockerAvailable: () => Promise<{ available: boolean }>;
    getDockerRuntimeInfo: () => Promise<any>;
    createSandbox: (config?: any) => Promise<{ success: boolean; sandbox?: any; error?: string }>;
    destroySandbox: () => Promise<{ success: boolean; error?: string }>;
    getSandboxStatus: () => Promise<{ active: boolean; sandbox?: any; containerStatus?: any; error?: string }>;
    setDockerMode: (enabled: boolean) => Promise<{ success: boolean; useDocker?: boolean; error?: string }>;
    listSandboxes: () => Promise<any[]>;
    isSandboxImageAvailable: () => Promise<{ available: boolean; reason?: string }>;
    pullSandboxImage: () => Promise<{ success: boolean; error?: string }>;
    onContainerStopped: (callback: (data: { reason: string; willFallbackToNative: boolean }) => void) => () => void;
    onDockerStatusChanged: (callback: (data: { active: boolean; error?: string; sandbox?: any }) => void) => () => void;

    // File attachment
    attachFiles: () => Promise<{ success: boolean; files: { name: string; originalPath: string; workDirPath: string }[] }>;
    removeAttachedFile: (fileName: string) => Promise<{ success: boolean; error?: string }>;

    // External Browser Support
    detectBrowsers: () => Promise<Array<{
        id: string;
        name: string;
        executablePath: string;
        version?: string;
        supportsCDP: boolean;
    }>>;
    launchExternalBrowser: (browserId: string) => Promise<{
        success: boolean;
        session?: { browserName: string; cdpPort: number; cdpEndpoint: string };
        error?: string;
        reused?: boolean;
    }>;
    closeExternalBrowser: () => Promise<{ success: boolean; error?: string }>;
    getExternalBrowserStatus: () => Promise<{
        hasActiveSession: boolean;
        browserName?: string;
        cdpPort?: number;
        cdpEndpoint?: string;
    }>;

    // Browser Shortcuts
    createBrowserShortcut: (browserId: string, browserName: string, locations: string[]) => Promise<Array<{
        success: boolean;
        location: string;
        path?: string;
        error?: string;
    }>>;
    removeBrowserShortcut: (browserId: string) => Promise<Array<{
        success: boolean;
        location: string;
        error?: string;
    }>>;
    getCreatedShortcuts: () => Promise<Array<{
        browserId: string;
        browserName: string;
        shortcutLocations: string[];
        created: boolean;
        createdAt?: string;
    }>>;
    getShortcutLocations: () => Promise<Array<{ id: string; label: string }>>;

    // Event listeners
    onUrlUpdate: (callback: (url: string) => void) => () => void;
    onTitleUpdate: (callback: (title: string) => void) => () => void;
    onLoadingChange: (callback: (loading: boolean) => void) => () => void;

    // External browser updates (for chat mode)
    onExternalBrowserTitle: (callback: (title: string) => void) => () => void;
    onExternalBrowserUrl: (callback: (url: string) => void) => () => void;

    // Settings window
    openSettingsWindow: () => Promise<{ success: boolean }>;

    // Platform info
    platform: 'darwin' | 'win32' | 'linux';
}


// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Auth
    isAuthenticated: () => ipcRenderer.invoke('auth:is-authenticated'),
    getUser: () => ipcRenderer.invoke('auth:get-user'),
    startGoogleLogin: () => ipcRenderer.invoke('auth:start-google-login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    showLogin: () => ipcRenderer.invoke('auth:show-login'),
    checkNow: () => ipcRenderer.invoke('auth:check-now'),
    onAuthStatusChanged: (callback: (authenticated: boolean) => void) => {
        const handler = (_: IpcRendererEvent, authenticated: boolean) => callback(authenticated);
        ipcRenderer.on('auth:status-changed', handler);
        return () => ipcRenderer.removeListener('auth:status-changed', handler);
    },

    // UI
    hideBrowser: () => ipcRenderer.invoke('ui:hide-browser'),
    showBrowser: () => ipcRenderer.invoke('ui:show-browser'),
    setSidebarVisible: (visible: boolean) => ipcRenderer.invoke('ui:set-sidebar-visible', visible),

    // Tabs
    createTab: (url?: string) => ipcRenderer.invoke('tab:create', url),
    closeTab: (tabId: string) => ipcRenderer.invoke('tab:close', tabId),
    switchTab: (tabId: string) => ipcRenderer.invoke('tab:switch', tabId),
    getTabs: () => ipcRenderer.invoke('tab:getAll'),
    getActiveTab: () => ipcRenderer.invoke('tab:getActive'),
    onTabsUpdated: (callback: (tabs: TabInfo[]) => void) => {
        const handler = (_: IpcRendererEvent, tabs: TabInfo[]) => callback(tabs);
        ipcRenderer.on('tabs:updated', handler);
        return () => ipcRenderer.removeListener('tabs:updated', handler);
    },

    // DataStore
    getDataStore: () => ipcRenderer.invoke('datastore:getAll'),
    getDataStoreValue: (key: string) => ipcRenderer.invoke('datastore:get', key),
    setDataStoreValue: (key: string, value: string | number | boolean) => ipcRenderer.invoke('datastore:set', key, value),
    removeDataStoreValue: (key: string) => ipcRenderer.invoke('datastore:remove', key),

    // Settings
    getSettings: () => ipcRenderer.invoke('settings:get'),
    updateSettings: (settings: any) => ipcRenderer.invoke('settings:update', settings),
    onSettingsChanged: (callback: (settings: any) => void) => {
        const handler = (_: IpcRendererEvent, settings: any) => callback(settings);
        ipcRenderer.on('settings:changed', handler);
        return () => ipcRenderer.removeListener('settings:changed', handler);
    },
    getLLMWorkDir: () => ipcRenderer.invoke('settings:get-llm-workdir'),
    browseDirectory: (defaultPath?: string) => ipcRenderer.invoke('dialog:browse-directory', defaultPath),

    // File attachment
    attachFiles: () => ipcRenderer.invoke('files:attach'),
    removeAttachedFile: (fileName: string) => ipcRenderer.invoke('files:remove', fileName),

    // Tasks
    getTasks: () => ipcRenderer.invoke('task:list'),
    getTask: (id: string) => ipcRenderer.invoke('task:get', id),
    createTask: (taskData: any) => ipcRenderer.invoke('task:create', taskData),
    updateTask: (id: string, updates: any) => ipcRenderer.invoke('task:update', id, updates),
    deleteTask: (id: string) => ipcRenderer.invoke('task:delete', id),
    updateTaskState: (id: string, stateUpdates: any) => ipcRenderer.invoke('task:update-state', id, stateUpdates),
    getTasksForDomain: (url: string) => ipcRenderer.invoke('task:get-for-domain', url),
    isTaskRunning: () => ipcRenderer.invoke('task:is-running'),
    runTask: (id: string) => ipcRenderer.invoke('task:run', id),
    onTaskExecute: (callback: (data: { taskId: string; prompt: string; mode: string; name: string }) => void) => {
        const handler = (_: IpcRendererEvent, data: any) => callback(data);
        ipcRenderer.on('task:execute-prompt', handler);
        return () => ipcRenderer.removeListener('task:execute-prompt', handler);
    },
    // Task Manager APIs
    getFavoritedTasks: () => ipcRenderer.invoke('task:get-favorited'),
    getRunningTasks: () => ipcRenderer.invoke('task:get-running'),
    getUpcomingScheduledTasks: () => ipcRenderer.invoke('task:get-upcoming'),
    toggleFavorite: (id: string) => ipcRenderer.invoke('task:toggle-favorite', id),
    stopTask: (id: string) => ipcRenderer.invoke('task:stop', id),
    clearRunningTask: (id: string) => ipcRenderer.invoke('task:clear-running', id),
    // Max concurrency
    getMaxConcurrency: () => ipcRenderer.invoke('task:get-max-concurrency'),
    setMaxConcurrency: (max: number) => ipcRenderer.invoke('task:set-max-concurrency', max),
    canRunMoreTasks: () => ipcRenderer.invoke('task:can-run-more'),

    // Browser navigation
    navigate: (url: string) => ipcRenderer.invoke('browser:navigate', url),
    goBack: () => ipcRenderer.invoke('browser:go-back'),
    goForward: () => ipcRenderer.invoke('browser:go-forward'),
    reload: () => ipcRenderer.invoke('browser:reload'),
    getUrl: () => ipcRenderer.invoke('browser:get-url'),
    getContent: () => ipcRenderer.invoke('browser:get-content'),
    executeJs: (script: string) => ipcRenderer.invoke('browser:execute-js', script),

    // Codex CLI
    executeCodex: (prompt: string, mode?: string) => ipcRenderer.invoke('codex:execute', prompt, mode),
    stopCodex: () => ipcRenderer.invoke('codex:stop'),
    respondPdsRequest: (key: string, value: string) => ipcRenderer.invoke('codex:pds-respond', key, value),
    onCodexOutput: (callback: (data: { type: string; data: string }) => void) => {
        const handler = (_: IpcRendererEvent, data: { type: string; data: string }) => callback(data);
        ipcRenderer.on('codex:output', handler);
        return () => ipcRenderer.removeListener('codex:output', handler);
    },
    onCodexComplete: (callback: (data: { code: number; output: string; errorOutput: string }) => void) => {
        const handler = (_: IpcRendererEvent, data: { code: number; output: string; errorOutput: string }) => callback(data);
        ipcRenderer.on('codex:complete', handler);
        return () => ipcRenderer.removeListener('codex:complete', handler);
    },
    onCodexError: (callback: (data: { error: string }) => void) => {
        const handler = (_: IpcRendererEvent, data: { error: string }) => callback(data);
        ipcRenderer.on('codex:error', handler);
        return () => ipcRenderer.removeListener('codex:error', handler);
    },
    onPdsRequest: (callback: (data: { key: string; message: string }) => void) => {
        const handler = (_: IpcRendererEvent, data: { key: string; message: string }) => callback(data);
        ipcRenderer.on('codex:pds-request', handler);
        return () => ipcRenderer.removeListener('codex:pds-request', handler);
    },
    onPdsStored: (callback: (data: { key: string; value: string }) => void) => {
        const handler = (_: IpcRendererEvent, data: { key: string; value: string }) => callback(data);
        ipcRenderer.on('codex:pds-stored', handler);
        return () => ipcRenderer.removeListener('codex:pds-stored', handler);
    },
    onTaskBlocked: (callback: (data: { type: string; message: string; detail: string }) => void) => {
        const handler = (_: IpcRendererEvent, data: { type: string; message: string; detail: string }) => callback(data);
        ipcRenderer.on('task:blocked', handler);
        return () => ipcRenderer.removeListener('task:blocked', handler);
    },

    // Codex CLI Authentication
    startCodexLogin: () => ipcRenderer.invoke('codex:start-login'),
    cancelCodexLogin: () => ipcRenderer.invoke('codex:cancel-login'),
    isCodexCliAuthenticated: () => ipcRenderer.invoke('codex:is-cli-authenticated'),
    onCodexLoginUrl: (callback: (url: string) => void) => {
        const handler = (_: IpcRendererEvent, url: string) => callback(url);
        ipcRenderer.on('codex:login-url', handler);
        return () => ipcRenderer.removeListener('codex:login-url', handler);
    },
    onCodexLoginComplete: (callback: (data: { success: boolean; error?: string }) => void) => {
        const handler = (_: IpcRendererEvent, data: { success: boolean; error?: string }) => callback(data);
        ipcRenderer.on('codex:login-complete', handler);
        return () => ipcRenderer.removeListener('codex:login-complete', handler);
    },
    onCodexDeviceCode: (callback: (code: string) => void) => {
        const handler = (_: IpcRendererEvent, code: string) => callback(code);
        ipcRenderer.on('codex:device-code', handler);
        return () => ipcRenderer.removeListener('codex:device-code', handler);
    },
    onTriggerCodexLogin: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('trigger-codex-login', handler);
        return () => ipcRenderer.removeListener('trigger-codex-login', handler);
    },

    // Docker/Sandbox APIs
    isDockerAvailable: () => ipcRenderer.invoke('docker:is-available'),
    getDockerRuntimeInfo: () => ipcRenderer.invoke('docker:get-runtime-info'),
    createSandbox: (config?: any) => ipcRenderer.invoke('docker:create-sandbox', config),
    destroySandbox: () => ipcRenderer.invoke('docker:destroy-sandbox'),
    getSandboxStatus: () => ipcRenderer.invoke('docker:get-sandbox-status'),
    setDockerMode: (enabled: boolean) => ipcRenderer.invoke('docker:set-mode', enabled),
    listSandboxes: () => ipcRenderer.invoke('docker:list-sandboxes'),
    isSandboxImageAvailable: () => ipcRenderer.invoke('docker:is-image-available'),
    pullSandboxImage: () => ipcRenderer.invoke('docker:pull-image'),
    onContainerStopped: (callback: (data: { reason: string; willFallbackToNative: boolean }) => void) => {
        const handler = (_: IpcRendererEvent, data: { reason: string; willFallbackToNative: boolean }) => callback(data);
        ipcRenderer.on('docker:container-stopped', handler);
        return () => ipcRenderer.removeListener('docker:container-stopped', handler);
    },
    onDockerStatusChanged: (callback: (data: { active: boolean; error?: string; sandbox?: any }) => void) => {
        const handler = (_: IpcRendererEvent, data: { active: boolean; error?: string; sandbox?: any }) => callback(data);
        ipcRenderer.on('docker:status-changed', handler);
        return () => ipcRenderer.removeListener('docker:status-changed', handler);
    },

    // Event listeners with cleanup
    onUrlUpdate: (callback: (url: string) => void) => {
        const handler = (_: IpcRendererEvent, url: string) => callback(url);
        ipcRenderer.on('browser:url-updated', handler);
        return () => ipcRenderer.removeListener('browser:url-updated', handler);
    },

    onTitleUpdate: (callback: (title: string) => void) => {
        const handler = (_: IpcRendererEvent, title: string) => callback(title);
        ipcRenderer.on('browser:title-updated', handler);
        return () => ipcRenderer.removeListener('browser:title-updated', handler);
    },

    onLoadingChange: (callback: (loading: boolean) => void) => {
        const handler = (_: IpcRendererEvent, loading: boolean) => callback(loading);
        ipcRenderer.on('browser:loading', handler);
        return () => ipcRenderer.removeListener('browser:loading', handler);
    },

    // Menu events
    onMenuToggleSettings: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('menu:toggle-settings', handler);
        return () => ipcRenderer.removeListener('menu:toggle-settings', handler);
    },
    onMenuShowSettings: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('menu:show-settings', handler);
        return () => ipcRenderer.removeListener('menu:show-settings', handler);
    },
    onMenuShowAbout: (callback: () => void) => {
        const handler = () => callback();
        ipcRenderer.on('menu:show-about', handler);
        return () => ipcRenderer.removeListener('menu:show-about', handler);
    },
    onMenuShowPanel: (callback: (panel: 'chat' | 'tasks' | null) => void) => {
        const handler = (_: IpcRendererEvent, panel: 'chat' | 'tasks' | null) => callback(panel);
        ipcRenderer.on('menu:show-panel', handler);
        return () => ipcRenderer.removeListener('menu:show-panel', handler);
    },

    // External Browser Support
    detectBrowsers: () => ipcRenderer.invoke('external-browser:detect'),
    launchExternalBrowser: (browserId: string) => ipcRenderer.invoke('external-browser:launch', browserId),
    closeExternalBrowser: () => ipcRenderer.invoke('external-browser:close'),
    getExternalBrowserStatus: () => ipcRenderer.invoke('external-browser:status'),

    // Browser Shortcuts
    createBrowserShortcut: (browserId: string, browserName: string, locations: string[]) =>
        ipcRenderer.invoke('shortcut:create', browserId, browserName, locations),
    removeBrowserShortcut: (browserId: string) => ipcRenderer.invoke('shortcut:remove', browserId),
    getCreatedShortcuts: () => ipcRenderer.invoke('shortcut:list'),
    getShortcutLocations: () => ipcRenderer.invoke('shortcut:locations'),

    // External browser updates (for chat mode)
    onExternalBrowserTitle: (callback: (title: string) => void) => {
        const handler = (_: IpcRendererEvent, title: string) => callback(title);
        ipcRenderer.on('external-browser-title', handler);
        return () => ipcRenderer.removeListener('external-browser-title', handler);
    },
    onExternalBrowserUrl: (callback: (url: string) => void) => {
        const handler = (_: IpcRendererEvent, url: string) => callback(url);
        ipcRenderer.on('external-browser-url', handler);
        return () => ipcRenderer.removeListener('external-browser-url', handler);
    },

    // Settings window
    openSettingsWindow: () => ipcRenderer.invoke('settings:open-standalone'),

    // Platform info
    platform: process.platform as 'darwin' | 'win32' | 'linux',
} as ElectronAPI);

// Declare the global type
declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
