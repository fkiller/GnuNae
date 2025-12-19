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

    // Event listeners
    onUrlUpdate: (callback: (url: string) => void) => () => void;
    onTitleUpdate: (callback: (title: string) => void) => () => void;
    onLoadingChange: (callback: (loading: boolean) => void) => () => void;

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

    // Platform info
    platform: process.platform as 'darwin' | 'win32' | 'linux',
} as ElectronAPI);

// Declare the global type
declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
