import React, { useState, useCallback, useRef, useEffect } from 'react';
import DataRequestCard from './DataRequestCard';

interface LogEntry {
    id: number;
    type: 'command' | 'response' | 'error' | 'info' | 'codex';
    message: string;
    timestamp: Date;
}

interface PdsRequest {
    key: string;
    message: string;
}

interface CodexSidebarProps {
    currentUrl: string;
    pageTitle: string;
    isAuthenticated: boolean;
    userEmail: string | null;
    onRequestLogin: () => void;
    onLogout: () => void;
}

type CodexMode = 'chat' | 'agent' | 'full-access';
type CodexModel = 'gpt-5.1-codex-max' | 'gpt-5.1-codex' | 'gpt-5.2' | 'gpt-5.1' | 'gpt-5.1-codex-mini';

const MODELS: { value: CodexModel; label: string }[] = [
    { value: 'gpt-5.1-codex-max', label: 'GPT-5.1-Codex-Max' },
    { value: 'gpt-5.1-codex', label: 'GPT-5.1-Codex' },
    { value: 'gpt-5.2', label: 'GPT-5.2' },
    { value: 'gpt-5.1', label: 'GPT-5.1' },
    { value: 'gpt-5.1-codex-mini', label: 'GPT-5.1-Codex-Mini' },
];

const MODES: { value: CodexMode; label: string; icon: string }[] = [
    { value: 'chat', label: 'Chat', icon: '💬' },
    { value: 'agent', label: 'Agent', icon: '🤖' },
    { value: 'full-access', label: 'Full Access', icon: '⚡' },
];

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
    const [mode, setMode] = useState<CodexMode>('agent');
    const [model, setModel] = useState<CodexModel>('gpt-5.1-codex-mini');
    const [activeMenu, setActiveMenu] = useState<'mode' | 'model' | null>(null);
    const [pdsRequest, setPdsRequest] = useState<PdsRequest | null>(null);
    const logContainerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const logIdRef = useRef(0);
    const lastPromptRef = useRef<string>('');

    // Subscribe to Codex output streams and PDS requests
    useEffect(() => {
        const unsubOutput = (window as any).electronAPI?.onCodexOutput?.((data: any) => {
            const message = data.data.trim();
            if (!message) return;

            // Check if debug mode is enabled (async - use localStorage cache)
            const isDebugMode = localStorage.getItem('gnunae-debug') === 'true';

            // In non-debug mode, aggressively filter verbose output
            if (!isDebugMode) {
                // Patterns to skip - DOM elements, debug info, verbose logs
                const skipPatterns = [
                    // DOM element dumps
                    /^(text|div|span|a|button|input|h[1-6]|li|p|ul|ol|table|tr|td|th|nav|header|footer|section|article|aside|form|label|select|option|img|svg|path|main|body|html):/i,
                    /<[a-z]/i, // HTML tags
                    /^\s*<\//i, // Closing tags
                    /^ref=\d+/i, // Element references
                    /^role=/i, // ARIA roles
                    /^aria-/i, // ARIA attributes
                    // Debug/info messages
                    /^Reading prompt/i,
                    /^No prompt provided/i,
                    /^Processing/i,
                    /^Loading/i,
                    /^Connecting/i,
                    /^Initializing/i,
                    /^\[debug\]/i,
                    /^\[info\]/i,
                    /^\[verbose\]/i,
                    /^DEBUG:/i,
                    /^INFO:/i,
                    // PDS request markers (hide from output)
                    /\[PDS_REQUEST:/i,
                    // PDS store markers (hide from output - shown as 💾 Stored: instead)
                    /\[PDS_STORE:/i,
                    // Very short messages (likely fragments)
                    /^.{1,3}$/,
                    // Whitespace-heavy lines
                    /^\s{4,}/,
                    // JSON-like fragments
                    /^[{}\[\],"':]+$/,
                    // Number-only lines
                    /^\d+$/,
                    // Empty-ish content
                    /^[-_=*#]+$/,
                ];

                if (skipPatterns.some(pattern => pattern.test(message))) {
                    return; // Skip this message in non-debug mode
                }

                // Also skip very long messages (likely DOM dumps) unless they look like actual content
                if (message.length > 500 && !message.includes('Error') && !message.includes('error')) {
                    return;
                }
            }

            addLog(data.type === 'stderr' ? 'error' : 'codex', message);
        });

        const unsubComplete = (window as any).electronAPI?.onCodexComplete?.((data: any) => {
            setIsProcessing(false);
            // DON'T clear pdsRequest here - let the card stay visible if there's a pending request
            if (data.code === 0) {
                addLog('info', '✓ Completed');
            } else {
                addLog('error', `✗ Exited with code ${data.code}`);
            }
        });

        const unsubError = (window as any).electronAPI?.onCodexError?.((data: any) => {
            setIsProcessing(false);
            setPdsRequest(null);
            addLog('error', `Error: ${data.error}`);
        });

        // Subscribe to PDS requests from Codex
        const unsubPds = (window as any).electronAPI?.onPdsRequest?.((data: PdsRequest) => {
            console.log('[CodexSidebar] PDS Request received:', data);
            setPdsRequest(data);
            addLog('info', `📋 Information needed: ${data.key}`);
        });

        // Subscribe to PDS store confirmations
        const unsubPdsStore = (window as any).electronAPI?.onPdsStored?.((data: { key: string; value: string }) => {
            console.log('[CodexSidebar] PDS Stored:', data);
            addLog('info', `💾 Stored: ${data.key} = ${data.value}`);
        });

        return () => {
            unsubOutput?.();
            unsubComplete?.();
            unsubError?.();
            unsubPds?.();
            unsubPdsStore?.();
        };
    }, []);

    // Auto-scroll logs
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    // Close menus on outside click
    useEffect(() => {
        const handleClick = () => setActiveMenu(null);
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

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

    const handlePdsSubmit = useCallback(async (value: string) => {
        if (!pdsRequest) return;

        addLog('info', `✓ Saved: ${pdsRequest.key} = ${value}`);
        await (window as any).electronAPI?.respondPdsRequest?.(pdsRequest.key, value);
        setPdsRequest(null);

        // Re-run the last prompt now that we have the data
        if (lastPromptRef.current) {
            addLog('info', '🔄 Retrying with saved data...');
            setIsProcessing(true);
            await (window as any).electronAPI?.executeCodex?.(lastPromptRef.current);
        }
    }, [pdsRequest, addLog]);

    const handlePdsCancel = useCallback(() => {
        if (pdsRequest) {
            addLog('info', `⏭ Skipped: ${pdsRequest.key}`);
        }
        setPdsRequest(null);
    }, [pdsRequest, addLog]);

    const handleExecutePrompt = useCallback(async () => {
        if (!prompt.trim()) return;

        if (!isAuthenticated) {
            addLog('error', '⚠ Please sign in to use Codex features.');
            onRequestLogin();
            return;
        }

        const userPrompt = prompt.trim();
        lastPromptRef.current = userPrompt; // Store for potential retry
        addLog('command', `> ${userPrompt}`);
        setPrompt('');
        setIsProcessing(true);

        addLog('info', `[${MODES.find(m => m.value === mode)?.label}] Sending...`);
        await (window as any).electronAPI?.executeCodex?.(userPrompt);
    }, [prompt, addLog, isAuthenticated, onRequestLogin, mode]);

    const handleStopCodex = useCallback(async () => {
        console.log('[CodexSidebar] Stop button clicked, isProcessing:', isProcessing);
        addLog('info', '⏹ Stopping...');
        const result = await (window as any).electronAPI?.stopCodex?.();
        console.log('[CodexSidebar] Stop result:', result);
        setIsProcessing(false);
        setPdsRequest(null);
        addLog('info', 'Stopped.');
    }, [addLog, isProcessing]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleExecutePrompt();
        }
    };

    const autoResize = () => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
        }
    };

    const toggleMenu = (menu: 'mode' | 'model', e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveMenu(activeMenu === menu ? null : menu);
    };

    return (
        <div className="codex-sidebar">
            {/* Header */}
            <div className="sidebar-header">
                <h2>Codex</h2>
                <div className="header-actions">
                    {isAuthenticated ? (
                        <div className="user-badge" onClick={onLogout} title="Click to sign out">
                            <span className="user-icon">👤</span>
                            <span className="user-email">{userEmail || 'Signed in'}</span>
                        </div>
                    ) : (
                        <button className="sign-in-btn" onClick={onRequestLogin}>Sign in</button>
                    )}
                </div>
            </div>

            {/* Context Info */}
            <div className="context-info">
                <div className="context-url" title={currentUrl}>
                    {currentUrl ? `📍 ${new URL(currentUrl).hostname}` : '📍 No page loaded'}
                </div>
            </div>

            {/* PDS Request Card */}
            {pdsRequest && (
                <DataRequestCard
                    dataKey={pdsRequest.key}
                    message={pdsRequest.message}
                    onSubmit={handlePdsSubmit}
                    onCancel={handlePdsCancel}
                />
            )}

            {/* Output Log */}
            <div className="log-section">
                <div className="log-container" ref={logContainerRef}>
                    {logs.length === 0 ? (
                        <div className="log-welcome">
                            <div className="welcome-icon">🚀</div>
                            <h3>Welcome to Codex</h3>
                            <p>Type a prompt below to get started.</p>
                            <div className="welcome-hints">
                                <div className="hint">💡 "Summarize this page"</div>
                                <div className="hint">💡 "Find all links"</div>
                            </div>
                        </div>
                    ) : (
                        logs.map((entry) => (
                            <div key={entry.id} className={`log-entry log-${entry.type}`}>
                                <span className="log-time">
                                    {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <pre className="log-message">{entry.message}</pre>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Input Area */}
            <div className="input-area">
                <div className="input-container">
                    <textarea
                        ref={textareaRef}
                        className="prompt-textarea"
                        value={prompt}
                        onChange={(e) => { setPrompt(e.target.value); autoResize(); }}
                        onKeyDown={handleKeyDown}
                        placeholder={isAuthenticated ? "Ask Codex..." : "Sign in to use Codex..."}
                        disabled={isProcessing || !isAuthenticated}
                        rows={1}
                    />
                    <button
                        className="send-btn"
                        onClick={isProcessing ? handleStopCodex : handleExecutePrompt}
                        disabled={!isAuthenticated || (!prompt.trim() && !isProcessing)}
                    >
                        {isProcessing ? '⬛' : '↑'}
                    </button>
                </div>
            </div>

            {/* Bottom Bar - Mode and Model only */}
            <div className="bottom-bar">
                <div className="bar-item mode-selector" onClick={(e) => toggleMenu('mode', e)}>
                    <span>{MODES.find(m => m.value === mode)?.icon}</span>
                    <span>{MODES.find(m => m.value === mode)?.label}</span>
                    {activeMenu === 'mode' && (
                        <div className="dropdown-menu">
                            <div className="dropdown-title">Mode</div>
                            {MODES.map(m => (
                                <div
                                    key={m.value}
                                    className={`dropdown-item ${mode === m.value ? 'active' : ''}`}
                                    onClick={() => { setMode(m.value); setActiveMenu(null); }}
                                >
                                    <span className="item-icon">{m.icon}</span>
                                    <span className="item-label">{m.label}</span>
                                    {mode === m.value && <span className="check">✓</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bar-item model-selector" onClick={(e) => toggleMenu('model', e)}>
                    <span>⬡</span>
                    <span>{MODELS.find(m => m.value === model)?.label}</span>
                    {activeMenu === 'model' && (
                        <div className="dropdown-menu">
                            <div className="dropdown-title">Model</div>
                            {MODELS.map(m => (
                                <div
                                    key={m.value}
                                    className={`dropdown-item ${model === m.value ? 'active' : ''}`}
                                    onClick={() => { setModel(m.value); setActiveMenu(null); }}
                                >
                                    <span className="item-label">{m.label}</span>
                                    {model === m.value && <span className="check">✓</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CodexSidebar;

