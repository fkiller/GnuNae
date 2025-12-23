import React, { useState, useEffect, useCallback } from 'react';
import AddressBar from './components/AddressBar';
import RightPanel from './components/RightPanel';
import Settings from './components/Settings';
import About from './components/About';
import TabBar from './components/TabBar';

// Tab info type
interface TabInfo {
    id: string;
    url: string;
    title: string;
    isActive: boolean;
}

// Type for electronAPI (defined in preload.ts)
declare global {
    interface Window {
        electronAPI?: {
            // Auth
            isAuthenticated: () => Promise<boolean>;
            getUser: () => Promise<string | null>;
            startGoogleLogin: () => Promise<{ success: boolean }>;
            logout: () => Promise<{ success: boolean }>;
            showLogin: () => Promise<{ success: boolean }>;
            checkNow: () => Promise<{ authenticated: boolean }>;
            onAuthStatusChanged: (callback: (authenticated: boolean) => void) => () => void;

            // Tabs
            createTab: (url?: string) => Promise<{ success: boolean; tabId?: string }>;
            closeTab: (tabId: string) => Promise<{ success: boolean }>;
            switchTab: (tabId: string) => Promise<{ success: boolean }>;
            getTabs: () => Promise<TabInfo[]>;
            getActiveTab: () => Promise<string | null>;
            onTabsUpdated: (callback: (tabs: TabInfo[]) => void) => () => void;

            // Browser
            navigate: (url: string) => Promise<{ success: boolean; url?: string; error?: string }>;
            goBack: () => Promise<{ success: boolean; error?: string }>;
            goForward: () => Promise<{ success: boolean; error?: string }>;
            reload: () => Promise<{ success: boolean }>;
            getUrl: () => Promise<string>;
            getContent: () => Promise<string>;
            executeJs: (script: string) => Promise<{ success: boolean; result?: any; error?: string }>;
            onUrlUpdate: (callback: (url: string) => void) => () => void;
            onTitleUpdate: (callback: (title: string) => void) => () => void;
            onLoadingChange: (callback: (loading: boolean) => void) => () => void;

            // Platform info
            platform: 'darwin' | 'win32' | 'linux';
        };
    }
}

const App: React.FC = () => {
    const [currentUrl, setCurrentUrl] = useState('');
    const [pageTitle, setPageTitle] = useState('New Tab');
    const [isLoading, setIsLoading] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [showAbout, setShowAbout] = useState(false);
    const [tabs, setTabs] = useState<TabInfo[]>([]);
    const [activePanel, setActivePanel] = useState<'chat' | 'tasks' | null>('chat');

    const checkAuthStatus = useCallback(async () => {
        console.log('[App] Checking auth status...');
        const authenticated = await window.electronAPI?.isAuthenticated?.() || false;
        console.log('[App] isAuthenticated result:', authenticated);
        setIsAuthenticated(authenticated);
        if (authenticated) {
            const email = await window.electronAPI?.getUser?.() ?? null;
            setUserEmail(email);
        }
    }, []);

    useEffect(() => {
        // Check initial auth status
        checkAuthStatus();

        // Get initial tabs
        window.electronAPI?.getTabs?.().then((initialTabs) => {
            if (initialTabs) setTabs(initialTabs);
        });

        // Subscribe to tab updates
        const unsubTabs = window.electronAPI?.onTabsUpdated?.((updatedTabs) => {
            setTabs(updatedTabs);
        });

        // Subscribe to auth status changes
        const unsubAuth = window.electronAPI?.onAuthStatusChanged?.((authenticated) => {
            console.log('[App] Auth status changed:', authenticated);
            setIsAuthenticated(authenticated);
            if (authenticated) {
                window.electronAPI?.getUser?.().then(email => setUserEmail(email ?? null));
            } else {
                setUserEmail(null);
            }
        });

        // Subscribe to URL updates from BrowserView
        const unsubUrl = window.electronAPI?.onUrlUpdate?.((url) => {
            console.log('[App] URL updated:', url);
            setCurrentUrl(url);

            // When we land on chatgpt.com (not auth pages), trigger auth check
            if (url.includes('chatgpt.com') && !url.includes('/auth')) {
                console.log('[App] On ChatGPT, triggering auth check...');
                window.electronAPI?.checkNow?.().then(result => {
                    console.log('[App] checkNow result:', result);
                    if (result?.authenticated) {
                        setIsAuthenticated(true);
                        window.electronAPI?.getUser?.().then(email => setUserEmail(email ?? null));
                    }
                });
            }
        });

        const unsubTitle = window.electronAPI?.onTitleUpdate?.((title) => {
            setPageTitle(title);
        });

        const unsubLoading = window.electronAPI?.onLoadingChange?.((loading) => {
            setIsLoading(loading);
        });

        // Get initial URL
        window.electronAPI?.getUrl?.().then((url) => {
            if (url) setCurrentUrl(url);
        });

        // Menu event: toggle settings
        const unsubMenuSettings = (window as any).electronAPI?.onMenuToggleSettings?.(() => {
            setShowSettings(prev => !prev);
        });

        // Menu event: show settings (from Edit menu on Windows)
        const unsubMenuShowSettings = (window as any).electronAPI?.onMenuShowSettings?.(() => {
            setShowSettings(true);
        });

        // Menu event: show about (from Help menu on Windows)
        const unsubMenuShowAbout = (window as any).electronAPI?.onMenuShowAbout?.(() => {
            setShowAbout(true);
        });

        // Menu event: show panel
        const unsubMenuPanel = (window as any).electronAPI?.onMenuShowPanel?.((panel: 'chat' | 'tasks' | null) => {
            setActivePanel(panel);
            (window as any).electronAPI?.setSidebarVisible?.(panel !== null);
        });

        return () => {
            unsubTabs?.();
            unsubAuth?.();
            unsubUrl?.();
            unsubTitle?.();
            unsubLoading?.();
            unsubMenuSettings?.();
            unsubMenuShowSettings?.();
            unsubMenuShowAbout?.();
            unsubMenuPanel?.();
        };
    }, [checkAuthStatus]);

    // Tab handlers
    const handleCreateTab = useCallback(async () => {
        await window.electronAPI?.createTab?.('https://www.google.com');
    }, []);

    const handleCloseTab = useCallback(async (tabId: string) => {
        await window.electronAPI?.closeTab?.(tabId);
    }, []);

    const handleSwitchTab = useCallback(async (tabId: string) => {
        await window.electronAPI?.switchTab?.(tabId);
    }, []);

    // Navigation handlers
    const handleNavigate = useCallback(async (url: string) => {
        const result = await window.electronAPI?.navigate?.(url);
        if (result?.success && result.url) {
            setCurrentUrl(result.url);
        }
    }, []);

    const handleGoBack = useCallback(async () => {
        await window.electronAPI?.goBack?.();
    }, []);

    const handleGoForward = useCallback(async () => {
        await window.electronAPI?.goForward?.();
    }, []);

    const handleReload = useCallback(async () => {
        await window.electronAPI?.reload?.();
    }, []);

    const handleRequestLogin = useCallback(async () => {
        console.log('[App] Login requested');
        await window.electronAPI?.startGoogleLogin?.();
    }, []);

    const handleLogout = useCallback(async () => {
        await window.electronAPI?.logout?.();
        setIsAuthenticated(false);
        setUserEmail(null);
    }, []);

    // Panel change handler - updates sidebar visibility for browser layout
    const handlePanelChange = useCallback((panel: 'chat' | 'tasks' | null) => {
        setActivePanel(panel);
        (window as any).electronAPI?.setSidebarVisible?.(panel !== null);
    }, []);

    // Get platform for platform-specific styling
    const platform = window.electronAPI?.platform || 'win32';

    return (
        <div className={`app-container platform-${platform}`}>
            <TabBar
                tabs={tabs}
                onTabClick={handleSwitchTab}
                onTabClose={handleCloseTab}
                onNewTab={handleCreateTab}
            />
            <AddressBar
                url={currentUrl}
                isLoading={isLoading}
                onNavigate={handleNavigate}
                onGoBack={handleGoBack}
                onGoForward={handleGoForward}
                onReload={handleReload}
                onOpenSettings={() => setShowSettings(true)}
                activePanel={activePanel}
                onPanelChange={handlePanelChange}
            />
            <div className="main-content">
                <div className="browser-placeholder">
                    {/* BrowserView is rendered by Electron behind this area */}
                </div>
                <RightPanel
                    activePanel={activePanel}
                    onPanelChange={handlePanelChange}
                    currentUrl={currentUrl}
                    pageTitle={pageTitle}
                    isAuthenticated={isAuthenticated}
                    userEmail={userEmail}
                    onRequestLogin={handleRequestLogin}
                    onLogout={handleLogout}
                />
                <Settings isOpen={showSettings} onClose={() => setShowSettings(false)} />
                <About isOpen={showAbout} onClose={() => setShowAbout(false)} />
            </div>
        </div>
    );
};

export default App;
