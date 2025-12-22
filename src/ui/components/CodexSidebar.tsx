import React, { useState, useCallback, useRef, useEffect } from 'react';
import DataRequestCard from './DataRequestCard';
import SaveTaskCard from './SaveTaskCard';
import { CODEX_MODELS, CODEX_MODES, DEFAULT_MODEL, DEFAULT_MODE, CodexModel, CodexMode, getModelLabel } from '../constants/codex';

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
    const [mode, setMode] = useState<CodexMode>(DEFAULT_MODE);
    const [model, setModel] = useState<CodexModel>(DEFAULT_MODEL);
    const [activeMenu, setActiveMenu] = useState<'mode' | 'model' | null>(null);
    const [pdsRequest, setPdsRequest] = useState<PdsRequest | null>(null);
    const [taskMode, setTaskMode] = useState(false);  // Task toggle
    const [showSaveTask, setShowSaveTask] = useState(false);
    const [lastExecutedPrompt, setLastExecutedPrompt] = useState('');
    const logContainerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const logIdRef = useRef(0);
    const lastPromptRef = useRef<string>('');
    const taskModeRef = useRef(false);  // Track taskMode for callbacks
    const taskTabRef = useRef<string | null>(null);  // Track tab created for task execution
    const originalTabRef = useRef<string | null>(null);  // Track user's original tab to switch back
    const dismissedDomainsRef = useRef<Set<string>>(new Set());  // Domains user dismissed for this session
    const [domainTasks, setDomainTasks] = useState<any[]>([]);  // On-going tasks matching current domain
    const [blockedTask, setBlockedTask] = useState<{ type: string; message: string; detail: string } | null>(null);
    const runningTaskIdRef = useRef<string | null>(null);  // Track which task is currently running

    // Keep taskModeRef in sync
    useEffect(() => { taskModeRef.current = taskMode; }, [taskMode]);

    // Load model/mode from settings on mount
    useEffect(() => {
        (window as any).electronAPI?.getSettings?.().then((s: any) => {
            if (s?.codex?.model) setModel(s.codex.model as CodexModel);
            if (s?.codex?.mode) setMode(s.codex.mode as CodexMode);
        });
    }, []);

    // Check for on-going tasks when URL changes
    useEffect(() => {
        if (!currentUrl || !isAuthenticated) {
            setDomainTasks([]);
            return;
        }

        // Extract domain from URL
        let domain: string;
        try {
            domain = new URL(currentUrl).hostname;
        } catch {
            return;
        }

        // Skip if user already dismissed for this domain this session
        if (dismissedDomainsRef.current.has(domain)) {
            return;
        }

        // Check for matching on-going tasks
        (window as any).electronAPI?.getTasksForDomain?.(currentUrl).then((tasks: any[]) => {
            if (tasks && tasks.length > 0) {
                setDomainTasks(tasks);
            } else {
                setDomainTasks([]);
            }
        });
    }, [currentUrl, isAuthenticated]);


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
                // If task mode was on, prompt to save as task
                if (taskModeRef.current) {
                    setShowSaveTask(true);
                }
            } else {
                addLog('error', `✗ Exited with code ${data.code}`);
            }

            // Clear running task state in main process
            if (runningTaskIdRef.current) {
                (window as any).electronAPI?.clearRunningTask?.(runningTaskIdRef.current);
                runningTaskIdRef.current = null;
            }

            // Close task tab if one was created (for one-time/scheduled tasks)
            if (taskTabRef.current) {
                const tabIdToClose = taskTabRef.current;
                const originalTabId = originalTabRef.current;
                taskTabRef.current = null;
                originalTabRef.current = null;

                // Switch back to original tab first, then close task tab
                setTimeout(async () => {
                    if (originalTabId) {
                        await (window as any).electronAPI?.switchTab?.(originalTabId);
                    }
                    await (window as any).electronAPI?.closeTab?.(tabIdToClose);
                    addLog('info', '🗑 Task tab closed');
                }, 1500);
            }
        });

        const unsubError = (window as any).electronAPI?.onCodexError?.((data: any) => {
            setIsProcessing(false);
            setPdsRequest(null);
            addLog('error', `Error: ${data.error}`);
            // Clear running task state
            if (runningTaskIdRef.current) {
                (window as any).electronAPI?.clearRunningTask?.(runningTaskIdRef.current);
                runningTaskIdRef.current = null;
            }
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

        // Subscribe to task blocked events (CAPTCHA/2FA/login)
        const unsubTaskBlocked = (window as any).electronAPI?.onTaskBlocked?.((data: { type: string; message: string; detail: string }) => {
            console.log('[CodexSidebar] Task blocked:', data);
            setBlockedTask(data);
            addLog('error', `⚠️ ${data.message}`);
        });

        // Subscribe to task execution requests
        const unsubTaskExecute = (window as any).electronAPI?.onTaskExecute?.(async (data: { taskId: string; prompt: string; mode: string; name: string; startUrl?: string; useNewTab?: boolean }) => {
            console.log('[CodexSidebar] Task execution requested:', data);
            addLog('info', `📋 Running task: ${data.name}`);
            setIsProcessing(true);
            runningTaskIdRef.current = data.taskId;  // Track which task is running

            // For one-time/scheduled tasks: create a new tab
            if (data.useNewTab) {
                // Store current tab ID so we can switch back later
                const currentTabId = await (window as any).electronAPI?.getActiveTab?.();
                if (currentTabId) {
                    originalTabRef.current = currentTabId;
                }

                addLog('info', '🗗 Creating new tab for task...');
                const result = await (window as any).electronAPI?.createTab?.(data.startUrl || 'about:blank');
                if (result?.success && result?.tabId) {
                    taskTabRef.current = result.tabId;
                    // Switch to the new tab so Codex operates on it
                    await (window as any).electronAPI?.switchTab?.(result.tabId);
                    // Wait for tab to load
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            } else if (data.startUrl) {
                // On-going tasks: navigate in current tab
                addLog('info', `🔗 Navigating to: ${data.startUrl}`);
                await (window as any).electronAPI?.navigate?.(data.startUrl);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            (window as any).electronAPI?.executeCodex?.(data.prompt, data.mode);
        });

        return () => {
            unsubOutput?.();
            unsubComplete?.();
            unsubError?.();
            unsubPds?.();
            unsubPdsStore?.();
            unsubTaskBlocked?.();
            unsubTaskExecute?.();
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

        let userPrompt = prompt.trim();
        lastPromptRef.current = userPrompt;

        // If Task mode is enabled, prepend task_pre_prompt
        if (taskMode) {
            const taskPrePrompt = `<task_mode>
You are creating a reproducible web activity (Task).
1. Optimize the execution steps - remove trial/error or dead ends
2. Minimize unnecessary actions and queries
3. When complete, the user will be prompted to save this as a task
</task_mode>

`;
            userPrompt = taskPrePrompt + userPrompt;
            setLastExecutedPrompt(prompt.trim()); // Store original for saving
            addLog('info', '📋 Task Mode: Creating reproducible task...');
        }

        addLog('command', `> ${prompt.trim()}`);
        setPrompt('');
        setIsProcessing(true);

        addLog('info', `[${CODEX_MODES.find(m => m.value === mode)?.label}] Sending...`);
        await (window as any).electronAPI?.executeCodex?.(userPrompt, mode);
    }, [prompt, addLog, isAuthenticated, onRequestLogin, mode, taskMode]);

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

            {/* Save Task Card */}
            {showSaveTask && (
                <SaveTaskCard
                    originalPrompt={lastExecutedPrompt}
                    currentUrl={currentUrl}
                    onSave={async (taskData) => {
                        const task = await (window as any).electronAPI?.createTask?.(taskData);
                        if (task) {
                            addLog('info', `✅ Task saved: ${task.name}`);
                        }
                        setShowSaveTask(false);
                        setTaskMode(false);
                    }}
                    onCancel={() => {
                        setShowSaveTask(false);
                        addLog('info', 'Task save cancelled.');
                    }}
                />
            )}

            {/* Blocked Task Warning (CAPTCHA/2FA/login detected) */}
            {blockedTask && (
                <div className="blocked-task-card">
                    <div className="blocked-task-header">
                        <span className="blocked-task-icon">⚠️</span>
                        <span className="blocked-task-title">{blockedTask.message}</span>
                    </div>
                    <div className="blocked-task-detail">
                        {blockedTask.type === 'captcha' && 'Please solve the CAPTCHA in the browser tab.'}
                        {blockedTask.type === '2fa' && 'Please complete 2FA verification in the browser tab.'}
                        {blockedTask.type === 'login' && 'Please log in to the website in the browser tab.'}
                        {blockedTask.type === 'blocked' && 'Access was blocked. Please check the browser tab.'}
                    </div>
                    <div className="blocked-task-actions">
                        <button
                            className="blocked-task-dismiss-btn"
                            onClick={() => setBlockedTask(null)}
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            {/* Domain Tasks Prompt (for on-going tasks) */}
            {domainTasks.length > 0 && !isProcessing && (
                <div className="domain-tasks-card">
                    <div className="domain-tasks-header">
                        <span className="domain-tasks-icon">📡</span>
                        <span className="domain-tasks-title">
                            {domainTasks.length === 1 ? 'Task available for this site' : `${domainTasks.length} tasks available`}
                        </span>
                    </div>
                    <div className="domain-tasks-list">
                        {domainTasks.map((task: any) => (
                            <div key={task.id} className="domain-task-item">
                                <span className="domain-task-name">{task.name}</span>
                                <button
                                    className="domain-task-run-btn"
                                    onClick={async () => {
                                        const result = await (window as any).electronAPI?.runTask?.(task.id);
                                        if (result?.success) {
                                            setDomainTasks([]);
                                        } else {
                                            addLog('error', result?.error || 'Failed to run task');
                                        }
                                    }}
                                >
                                    ▶ Run
                                </button>
                            </div>
                        ))}
                    </div>
                    <button
                        className="domain-tasks-dismiss"
                        onClick={() => {
                            // Remember to not show for this domain again this session
                            try {
                                const domain = new URL(currentUrl).hostname;
                                dismissedDomainsRef.current.add(domain);
                            } catch { }
                            setDomainTasks([]);
                        }}
                    >
                        Dismiss
                    </button>
                </div>
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
                <div className="input-toolbar">
                    <button
                        className={`toolbar-btn task-toggle ${taskMode ? 'active' : ''}`}
                        onClick={() => setTaskMode(!taskMode)}
                        title={taskMode ? "Task Mode ON - will prompt to save as task" : "Task Mode OFF"}
                    >
                        📋 {taskMode ? 'Task ON' : 'Task'}
                    </button>
                </div>
                <div className="input-container">
                    <textarea
                        ref={textareaRef}
                        className="prompt-textarea"
                        value={prompt}
                        onChange={(e) => { setPrompt(e.target.value); autoResize(); }}
                        onKeyDown={handleKeyDown}
                        placeholder={isAuthenticated ? (taskMode ? "Describe task to automate..." : "Ask Codex...") : "Sign in to use Codex..."}
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
                    <span>{CODEX_MODES.find(m => m.value === mode)?.icon}</span>
                    <span>{CODEX_MODES.find(m => m.value === mode)?.label}</span>
                    {activeMenu === 'mode' && (
                        <div className="dropdown-menu">
                            <div className="dropdown-title">Mode</div>
                            {CODEX_MODES.map(m => (
                                <div
                                    key={m.value}
                                    className={`dropdown-item ${mode === m.value ? 'active' : ''}`}
                                    onClick={() => { setMode(m.value); setActiveMenu(null); }}
                                >
                                    <span className="item-icon">{m.icon}</span>
                                    <div className="item-text">
                                        <span className="item-label">{m.label}</span>
                                        <span className="item-hint">{m.hint}</span>
                                    </div>
                                    {mode === m.value && <span className="check">✓</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bar-item model-selector" onClick={(e) => toggleMenu('model', e)}>
                    <span>⬡</span>
                    <span>{getModelLabel(model)}</span>
                    {activeMenu === 'model' && (
                        <div className="dropdown-menu">
                            <div className="dropdown-title">Model</div>
                            {CODEX_MODELS.map(m => (
                                <div
                                    key={m.value}
                                    className={`dropdown-item ${model === m.value ? 'active' : ''}`}
                                    onClick={() => { setModel(m.value); setActiveMenu(null); }}
                                >
                                    <span className="item-label">{getModelLabel(m.value)}</span>
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

