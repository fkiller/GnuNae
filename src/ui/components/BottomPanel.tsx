import React, { useState, useEffect, useRef, useCallback } from 'react';

interface LogEntry {
    id: number;
    timestamp: Date;
    level: 'log' | 'warn' | 'error' | 'info';
    message: string;
    source: 'main' | 'renderer';
}

interface BottomPanelProps {
    isOpen: boolean;
    activeTab: 'console' | 'terminal';
    onClose: () => void;
    onTabChange: (tab: 'console' | 'terminal') => void;
}

const BottomPanel: React.FC<BottomPanelProps> = ({
    isOpen,
    activeTab,
    onClose,
    onTabChange
}) => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [terminalLines, setTerminalLines] = useState<string[]>([]);
    const [terminalInput, setTerminalInput] = useState('');
    const [terminalReady, setTerminalReady] = useState(false);
    const [panelHeight, setPanelHeight] = useState(200);
    const logContainerRef = useRef<HTMLDivElement>(null);
    const terminalContainerRef = useRef<HTMLDivElement>(null);
    const terminalInputRef = useRef<HTMLInputElement>(null);
    const isDraggingRef = useRef(false);
    const startYRef = useRef(0);
    const startHeightRef = useRef(0);

    // Subscribe to console logs from main process
    useEffect(() => {
        const unsubLogs = (window as any).electronAPI?.onConsoleLog?.((entry: Omit<LogEntry, 'id'>) => {
            setLogs(prev => [...prev, { ...entry, id: Date.now() + Math.random() }].slice(-500));
        });

        // Get initial logs
        (window as any).electronAPI?.getConsoleLogs?.().then((initialLogs: LogEntry[]) => {
            if (initialLogs) setLogs(initialLogs);
        });

        return () => {
            unsubLogs?.();
        };
    }, []);

    // Subscribe to terminal output
    useEffect(() => {
        const unsubTerminalOutput = (window as any).electronAPI?.onTerminalOutput?.((data: string) => {
            // Split by newlines and add each line
            const lines = data.split(/\r?\n/);
            setTerminalLines(prev => [...prev, ...lines].slice(-1000));
        });

        const unsubTerminalReady = (window as any).electronAPI?.onTerminalReady?.(() => {
            setTerminalReady(true);
            setTerminalLines(prev => [...prev, '$ Terminal ready with embedded Node.js/npm/Codex']);
        });

        return () => {
            unsubTerminalOutput?.();
            unsubTerminalReady?.();
        };
    }, []);

    // Auto-scroll logs
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    // Auto-scroll terminal
    useEffect(() => {
        if (terminalContainerRef.current) {
            terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
        }
    }, [terminalLines]);

    // Spawn terminal when tab switches to terminal
    useEffect(() => {
        if (isOpen && activeTab === 'terminal' && !terminalReady) {
            (window as any).electronAPI?.spawnTerminal?.().catch((err: Error) => {
                setTerminalLines(prev => [...prev, `Error spawning terminal: ${err.message}`]);
            });
        }
    }, [isOpen, activeTab, terminalReady]);

    // Focus terminal input when terminal tab is active
    useEffect(() => {
        if (isOpen && activeTab === 'terminal' && terminalInputRef.current) {
            terminalInputRef.current.focus();
        }
    }, [isOpen, activeTab]);

    // Handle terminal input submit
    const handleTerminalSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        if (terminalInput.trim()) {
            setTerminalLines(prev => [...prev, `$ ${terminalInput}`]);
            (window as any).electronAPI?.sendTerminalInput?.(terminalInput + '\n');
            setTerminalInput('');
        }
    }, [terminalInput]);

    // Clear console logs
    const handleClearLogs = useCallback(() => {
        setLogs([]);
    }, []);

    // Resize handle drag
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        isDraggingRef.current = true;
        startYRef.current = e.clientY;
        startHeightRef.current = panelHeight;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [panelHeight]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (isDraggingRef.current) {
            const delta = startYRef.current - e.clientY;
            const newHeight = Math.max(100, Math.min(600, startHeightRef.current + delta));
            setPanelHeight(newHeight);
        }
    }, []);

    const handleMouseUp = useCallback(() => {
        isDraggingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }, [handleMouseMove]);

    // Format timestamp
    const formatTime = (date: Date) => {
        return new Date(date).toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        });
    };

    // Get log level class
    const getLevelClass = (level: LogEntry['level']) => {
        switch (level) {
            case 'error': return 'log-error';
            case 'warn': return 'log-warn';
            case 'info': return 'log-info';
            default: return 'log-default';
        }
    };

    if (!isOpen) return null;

    return (
        <div className="bottom-panel" style={{ height: panelHeight }}>
            {/* Resize handle */}
            <div className="bottom-panel-resize" onMouseDown={handleMouseDown} />

            {/* Tab bar */}
            <div className="bottom-panel-tabs">
                <button
                    className={`bottom-panel-tab ${activeTab === 'console' ? 'active' : ''}`}
                    onClick={() => onTabChange('console')}
                >
                    📋 Console
                </button>
                <button
                    className={`bottom-panel-tab ${activeTab === 'terminal' ? 'active' : ''}`}
                    onClick={() => onTabChange('terminal')}
                >
                    💻 Terminal
                </button>
                <div className="bottom-panel-spacer" />
                {activeTab === 'console' && (
                    <button className="bottom-panel-action" onClick={handleClearLogs} title="Clear">
                        🗑️
                    </button>
                )}
                <button className="bottom-panel-close" onClick={onClose}>
                    ✕
                </button>
            </div>

            {/* Console content */}
            {activeTab === 'console' && (
                <div className="bottom-panel-content console-content" ref={logContainerRef}>
                    {logs.length === 0 ? (
                        <div className="console-empty">
                            No console logs yet. Logs from the main process will appear here.
                        </div>
                    ) : (
                        logs.map(log => (
                            <div key={log.id} className={`console-line ${getLevelClass(log.level)}`}>
                                <span className="console-time">{formatTime(log.timestamp)}</span>
                                <span className="console-source">[{log.source}]</span>
                                <span className="console-message">{log.message}</span>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Terminal content */}
            {activeTab === 'terminal' && (
                <div className="bottom-panel-content terminal-content">
                    <div className="terminal-output" ref={terminalContainerRef}>
                        {terminalLines.map((line, i) => (
                            <div key={i} className="terminal-line">{line}</div>
                        ))}
                    </div>
                    <form className="terminal-input-form" onSubmit={handleTerminalSubmit}>
                        <span className="terminal-prompt">$</span>
                        <input
                            ref={terminalInputRef}
                            type="text"
                            className="terminal-input"
                            value={terminalInput}
                            onChange={e => setTerminalInput(e.target.value)}
                            placeholder={terminalReady ? "Enter command..." : "Starting terminal..."}
                            disabled={!terminalReady}
                        />
                    </form>
                </div>
            )}
        </div>
    );
};

export default BottomPanel;
