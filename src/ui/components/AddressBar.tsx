import React, { useState, useCallback, KeyboardEvent } from 'react';

interface AddressBarProps {
    url: string;
    isLoading: boolean;
    onNavigate: (url: string) => void;
    onGoBack: () => void;
    onGoForward: () => void;
    onReload: () => void;
}

const AddressBar: React.FC<AddressBarProps> = ({
    url,
    isLoading,
    onNavigate,
    onGoBack,
    onGoForward,
    onReload,
}) => {
    const [inputUrl, setInputUrl] = useState(url);

    // Sync input with external URL changes
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
                <button
                    className="nav-btn"
                    onClick={onGoBack}
                    title="Go Back"
                    aria-label="Go Back"
                >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M11 2L5 8l6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                <button
                    className="nav-btn"
                    onClick={onGoForward}
                    title="Go Forward"
                    aria-label="Go Forward"
                >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M5 2l6 6-6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                <button
                    className="nav-btn"
                    onClick={onReload}
                    title={isLoading ? 'Loading...' : 'Reload'}
                    aria-label="Reload"
                >
                    {isLoading ? (
                        <svg width="16" height="16" viewBox="0 0 16 16" className="spin">
                            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="30" strokeLinecap="round" />
                        </svg>
                    ) : (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
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
                <button type="submit" className="go-btn" title="Navigate">
                    Go
                </button>
            </form>
        </div>
    );
};

export default AddressBar;
