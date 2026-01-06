import React, { useState, useEffect, useCallback } from 'react';
import RightPanel from './components/RightPanel';

// Chat-only mode component for external browser integration
// Shows only the sidebar chat panel, synced with external browser title

interface ChatModeAppProps {
    browserName: string;
}

const ChatModeApp: React.FC<ChatModeAppProps> = ({ browserName }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [externalUrl, setExternalUrl] = useState('');
    const [externalTitle, setExternalTitle] = useState(browserName);

    useEffect(() => {
        // Check initial auth status
        const checkAuth = async () => {
            const authenticated = await (window as any).electronAPI?.isAuthenticated?.() || false;
            setIsAuthenticated(authenticated);
            if (authenticated) {
                const email = await (window as any).electronAPI?.getUser?.() ?? null;
                setUserEmail(email);
            }
        };
        checkAuth();

        // Subscribe to auth status changes
        const unsubAuth = (window as any).electronAPI?.onAuthStatusChanged?.((authenticated: boolean) => {
            setIsAuthenticated(authenticated);
            if (authenticated) {
                (window as any).electronAPI?.getUser?.().then((email: string | null) => setUserEmail(email ?? null));
            } else {
                setUserEmail(null);
            }
        });

        // Subscribe to external browser title/URL updates from main process
        const unsubTitle = (window as any).electronAPI?.onExternalBrowserTitle?.((title: string) => {
            setExternalTitle(title);
        });

        const unsubUrl = (window as any).electronAPI?.onExternalBrowserUrl?.((url: string) => {
            setExternalUrl(url);
        });

        return () => {
            unsubAuth?.();
            unsubTitle?.();
            unsubUrl?.();
        };
    }, []);

    const handleRequestLogin = useCallback(async () => {
        await (window as any).electronAPI?.startCodexLogin?.();
    }, []);

    const handleLogout = useCallback(async () => {
        await (window as any).electronAPI?.logout?.();
        setIsAuthenticated(false);
        setUserEmail(null);
    }, []);

    const handleOpenSettings = useCallback(() => {
        // In chat mode, open settings in standalone window
        (window as any).electronAPI?.openSettingsWindow?.();
    }, []);

    // Get platform for styling
    const platform = (window as any).electronAPI?.platform || 'win32';

    return (
        <div className={`chat-mode-container platform-${platform}`}>
            <div className="chat-mode-header">
                <div className="chat-mode-title">
                    <span className="browser-icon">🌐</span>
                    <span className="browser-name">{browserName}</span>
                    {externalTitle && externalTitle !== browserName && (
                        <span className="page-title">| {externalTitle}</span>
                    )}
                </div>
                <button
                    className="settings-button"
                    onClick={handleOpenSettings}
                    title="Settings"
                >
                    ⚙️
                </button>
            </div>
            <div className="chat-mode-content">
                <RightPanel
                    activePanel="chat"
                    onPanelChange={() => { }}
                    currentUrl={externalUrl}
                    pageTitle={externalTitle}
                    isAuthenticated={isAuthenticated}
                    userEmail={userEmail}
                    onRequestLogin={handleRequestLogin}
                    onLogout={handleLogout}
                />
            </div>
        </div>
    );
};

export default ChatModeApp;
