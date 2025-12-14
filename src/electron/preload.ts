import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

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

    // Browser navigation
    navigate: (url: string) => Promise<{ success: boolean; url?: string; error?: string }>;
    goBack: () => Promise<{ success: boolean; error?: string }>;
    goForward: () => Promise<{ success: boolean; error?: string }>;
    reload: () => Promise<{ success: boolean }>;
    getUrl: () => Promise<string>;
    getContent: () => Promise<string>;
    executeJs: (script: string) => Promise<{ success: boolean; result?: any; error?: string }>;

    // Codex CLI
    executeCodex: (prompt: string) => Promise<{ success: boolean; output?: string; errorOutput?: string; error?: string }>;
    stopCodex: () => Promise<{ success: boolean }>;
    onCodexOutput: (callback: (data: { type: string; data: string }) => void) => () => void;
    onCodexComplete: (callback: (data: { code: number; output: string; errorOutput: string }) => void) => () => void;
    onCodexError: (callback: (data: { error: string }) => void) => () => void;

    // Event listeners
    onUrlUpdate: (callback: (url: string) => void) => () => void;
    onTitleUpdate: (callback: (title: string) => void) => () => void;
    onLoadingChange: (callback: (loading: boolean) => void) => () => void;
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

    // Browser navigation
    navigate: (url: string) => ipcRenderer.invoke('browser:navigate', url),
    goBack: () => ipcRenderer.invoke('browser:go-back'),
    goForward: () => ipcRenderer.invoke('browser:go-forward'),
    reload: () => ipcRenderer.invoke('browser:reload'),
    getUrl: () => ipcRenderer.invoke('browser:get-url'),
    getContent: () => ipcRenderer.invoke('browser:get-content'),
    executeJs: (script: string) => ipcRenderer.invoke('browser:execute-js', script),

    // Codex CLI
    executeCodex: (prompt: string) => ipcRenderer.invoke('codex:execute', prompt),
    stopCodex: () => ipcRenderer.invoke('codex:stop'),
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
} as ElectronAPI);

// Declare the global type
declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
