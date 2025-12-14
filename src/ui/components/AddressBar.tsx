import React, { useState, useCallback, KeyboardEvent } from 'react';

interface AddressBarProps {
    url: string;
    isLoading: boolean;
    onNavigate: (url: string) => void;
    onGoBack: () => void;
    onGoForward: () => void;
    onReload: () => void;
    onOpenSettings: () => void;
}

const AddressBar: React.FC<AddressBarProps> = ({
    url,
    isLoading,
    onNavigate,
    onGoBack,
    onGoForward,
    onReload,
    onOpenSettings,
}) => {
    const [inputUrl, setInputUrl] = useState(url);

    React.useEffect(() => {
        setInputUrl(url);
    }, [url]);

    const handleSubmit = useCallback(
        (e?: React.FormEvent) => {
            e?.preventDefault();
            if (inputUrl.trim()) {
                onNavigate(inputUrl.trim());
            }
        },
        [inputUrl, onNavigate]
    );

    const handleKeyDown = useCallback(
        (e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                handleSubmit();
            }
        },
        [handleSubmit]
    );

    return (
        <div className="address-bar">
            <div className="nav-buttons">
                <button className="nav-btn" onClick={onGoBack} title="Go Back">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M11 2L5 8l6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                <button className="nav-btn" onClick={onGoForward} title="Go Forward">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M5 2l6 6-6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                <button className="nav-btn" onClick={onReload} title={isLoading ? 'Loading...' : 'Reload'}>
                    {isLoading ? (
                        <svg width="16" height="16" viewBox="0 0 16 16" className="spin">
                            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="30" strokeLinecap="round" />
                        </svg>
                    ) : (
                        <svg width="16" height="16" viewBox="0 0 16 16">
                            <path d="M13.65 2.35A8 8 0 1 0 16 8h-2a6 6 0 1 1-1.76-4.24L10 6h6V0l-2.35 2.35z" fill="currentColor" />
                        </svg>
                    )}
                </button>
            </div>
            <form className="url-form" onSubmit={handleSubmit}>
                <input
                    type="text"
                    className="url-input"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter URL or search..."
                    spellCheck={false}
                />
                <button type="submit" className="go-btn" title="Navigate">Go</button>
                <button type="button" className="settings-btn-nav" onClick={onOpenSettings} title="Settings">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
                    </svg>
                </button>
            </form>
        </div>
    );
};

export default AddressBar;
