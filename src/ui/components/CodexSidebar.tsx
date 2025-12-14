import React, { useState, useCallback, useRef, useEffect } from 'react';

interface LogEntry {
    id: number;
    type: 'command' | 'response' | 'error' | 'info' | 'codex';
    message: string;
    timestamp: Date;
}

interface CodexSidebarProps {
    currentUrl: string;
    pageTitle: string;
    isAuthenticated: boolean;
    userEmail: string | null;
    onRequestLogin: () => void;
    onLogout: () => void;
}

const CodexSidebar: React.FC<CodexSidebarProps> = ({
    currentUrl,
    pageTitle,
    isAuthenticated,
    userEmail,
    onRequestLogin,
    onLogout,
}) => {
    const [prompt, setPrompt] = useState('');
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const logContainerRef = useRef<HTMLDivElement>(null);
    const logIdRef = useRef(0);

    // Subscribe to Codex output streams
    useEffect(() => {
        const unsubOutput = window.electronAPI?.onCodexOutput?.((data) => {
            addLog(data.type === 'stderr' ? 'error' : 'codex', data.data.trim());
        });

        const unsubComplete = window.electronAPI?.onCodexComplete?.((data) => {
            setIsProcessing(false);
            if (data.code === 0) {
                addLog('info', '✓ Codex completed successfully');
            } else {
                addLog('error', `✗ Codex exited with code ${data.code}`);
            }
        });

        const unsubError = window.electronAPI?.onCodexError?.((data) => {
            setIsProcessing(false);
            addLog('error', `Codex error: ${data.error}`);
        });

        addLog('info', 'Codex Sidebar ready. Type a prompt and press Execute.');

        return () => {
            unsubOutput?.();
            unsubComplete?.();
            unsubError?.();
        };
    }, []);

    // Auto-scroll logs
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    const addLog = useCallback((type: LogEntry['type'], message: string) => {
        if (!message.trim()) return;
        const entry: LogEntry = {
            id: ++logIdRef.current,
            type,
            message,
            timestamp: new Date(),
        };
        setLogs((prev) => [...prev.slice(-100), entry]);
    }, []);

    const handleExecutePrompt = useCallback(async () => {
        if (!prompt.trim()) return;

        // Check auth first
        if (!isAuthenticated) {
            addLog('error', '⚠ Please sign in to use Codex features.');
            onRequestLogin();
            return;
        }

        const userPrompt = prompt.trim();
        addLog('command', `> ${userPrompt}`);
        setPrompt('');
        setIsProcessing(true);

        // Send to Codex CLI
        addLog('info', 'Sending to Codex...');
        await window.electronAPI?.executeCodex?.(userPrompt);
    }, [prompt, addLog, isAuthenticated, onRequestLogin]);

    const handleStopCodex = useCallback(async () => {
        await window.electronAPI?.stopCodex?.();
        setIsProcessing(false);
        addLog('info', 'Codex execution stopped.');
    }, [addLog]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleExecutePrompt();
        }
    };

    return (
        <div className="codex-sidebar">
            <div className="sidebar-header">
                <h2>Codex Control</h2>
                <div className="connection-status connected">
                    <span className="status-dot"></span>
                    Codex CLI
                </div>
            </div>

            {/* Auth Status */}
            <div className="auth-status">
                {isAuthenticated ? (
                    <div className="auth-logged-in">
                        <span className="auth-icon">✓</span>
                        <div className="auth-info">
                            <span className="auth-label">Signed in</span>
                            {userEmail && <span className="auth-email">{userEmail}</span>}
                        </div>
                        <button className="auth-logout-btn" onClick={onLogout} title="Sign out">
                            ⎋
                        </button>
                    </div>
                ) : (
                    <div className="auth-logged-out">
                        <span className="auth-warning">⚠ Not signed in</span>
                        <button className="auth-login-btn" onClick={onRequestLogin}>
                            Sign in to OpenAI
                        </button>
                    </div>
                )}
            </div>

            <div className="page-info">
                <div className="page-title" title={pageTitle}>{pageTitle}</div>
                <div className="page-url" title={currentUrl}>{currentUrl}</div>
            </div>

            <div className="prompt-section">
                <textarea
                    className="prompt-input"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isAuthenticated
                        ? "Enter prompt for Codex (e.g., 'Navigate to github.com and take a snapshot')"
                        : "Sign in to use Codex..."
                    }
                    disabled={isProcessing || !isAuthenticated}
                    rows={3}
                />
                <div className="button-row">
                    <button
                        className="execute-btn"
                        onClick={handleExecutePrompt}
                        disabled={!prompt.trim() || isProcessing || !isAuthenticated}
                    >
                        {isProcessing ? 'Running...' : 'Execute'}
                    </button>
                    {isProcessing && (
                        <button
                            className="stop-btn"
                            onClick={handleStopCodex}
                        >
                            Stop
                        </button>
                    )}
                </div>
            </div>

            <div className="log-section">
                <div className="log-header">Output</div>
                <div className="log-container" ref={logContainerRef}>
                    {logs.map((entry) => (
                        <div key={entry.id} className={`log-entry log-${entry.type}`}>
                            <span className="log-time">
                                {entry.timestamp.toLocaleTimeString()}
                            </span>
                            <pre className="log-message">{entry.message}</pre>
                        </div>
                    ))}
                    {logs.length === 0 && (
                        <div className="log-empty">Ready for prompts.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CodexSidebar;
