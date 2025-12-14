import React, { useState, useEffect, useCallback } from 'react';
import AddressBar from './components/AddressBar';
import CodexSidebar from './components/CodexSidebar';

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
        };
    }
}

const App: React.FC = () => {
    const [currentUrl, setCurrentUrl] = useState('');
    const [pageTitle, setPageTitle] = useState('New Tab');
    const [isLoading, setIsLoading] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [userEmail, setUserEmail] = useState<string | null>(null);

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

        return () => {
            unsubAuth?.();
            unsubUrl?.();
            unsubTitle?.();
            unsubLoading?.();
        };
    }, [checkAuthStatus]);

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
        // Navigate directly to OpenAI login
        await window.electronAPI?.startGoogleLogin?.();
    }, []);

    const handleLogout = useCallback(async () => {
        await window.electronAPI?.logout?.();
        setIsAuthenticated(false);
        setUserEmail(null);
    }, []);

    return (
        <div className="app-container">
            <AddressBar
                url={currentUrl}
                isLoading={isLoading}
                onNavigate={handleNavigate}
                onGoBack={handleGoBack}
                onGoForward={handleGoForward}
                onReload={handleReload}
            />
            <div className="main-content">
                <div className="browser-placeholder">
                    {/* BrowserView is rendered by Electron behind this area */}
                </div>
                <CodexSidebar
                    currentUrl={currentUrl}
                    pageTitle={pageTitle}
                    isAuthenticated={isAuthenticated}
                    userEmail={userEmail}
                    onRequestLogin={handleRequestLogin}
                    onLogout={handleLogout}
                />
            </div>
        </div>
    );
};

export default App;
