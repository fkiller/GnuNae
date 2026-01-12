import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

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
    const [panelHeight, setPanelHeight] = useState(200);
    const [terminalActive, setTerminalActive] = useState(false);
    const logContainerRef = useRef<HTMLDivElement>(null);
    const terminalContainerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const isDraggingRef = useRef(false);
    const startYRef = useRef(0);
    const startHeightRef = useRef(0);
    // Debounce for spawn attempts to prevent infinite restart loop
    const lastSpawnAttemptRef = useRef<number>(0);
    const spawnFailCountRef = useRef<number>(0);

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

    // Initialize xterm.js when terminal tab is active
    useEffect(() => {
        if (!isOpen || activeTab !== 'terminal' || !terminalContainerRef.current) return;

        // Create terminal if not exists
        if (!terminalRef.current) {
            const term = new Terminal({
                cursorBlink: true,
                fontSize: 13,
                fontFamily: "'SF Mono', 'Monaco', 'Menlo', 'Consolas', monospace",
                theme: {
                    background: '#0d1117',
                    foreground: '#c9d1d9',
                    cursor: '#58a6ff',
                    cursorAccent: '#0d1117',
                    black: '#0d1117',
                    red: '#ff7b72',
                    green: '#7ee787',
                    yellow: '#d29922',
                    blue: '#58a6ff',
                    magenta: '#bc8cff',
                    cyan: '#39c5cf',
                    white: '#c9d1d9',
                    brightBlack: '#484f58',
                    brightRed: '#ffa198',
                    brightGreen: '#56d364',
                    brightYellow: '#e3b341',
                    brightBlue: '#79c0ff',
                    brightMagenta: '#d2a8ff',
                    brightCyan: '#76e3ea',
                    brightWhite: '#f0f6fc',
                },
                scrollback: 1000,
            });

            const fitAddon = new FitAddon();
            term.loadAddon(fitAddon);
            terminalRef.current = term;
            fitAddonRef.current = fitAddon;

            term.open(terminalContainerRef.current);
            fitAddon.fit();

            // Handle user input
            term.onData((data) => {
                (window as any).electronAPI?.sendTerminalInput?.(data);
            });

            // Focus terminal
            term.focus();
        } else {
            // Just fit if terminal already exists
            fitAddonRef.current?.fit();
            terminalRef.current?.focus();
        }
    }, [isOpen, activeTab]);

    // Subscribe to terminal output and ready events
    useEffect(() => {
        const unsubTerminalOutput = (window as any).electronAPI?.onTerminalOutput?.((data: string) => {
            terminalRef.current?.write(data);
        });

        const unsubTerminalReady = (window as any).electronAPI?.onTerminalReady?.(() => {
            setTerminalActive(true);
            terminalRef.current?.write('\x1b[32m$\x1b[0m Terminal ready with embedded Node.js/npm/Codex\r\n');
        });

        const unsubTerminalClosed = (window as any).electronAPI?.onTerminalClosed?.(() => {
            setTerminalActive(false);
            // Show message that terminal closed - spawn useEffect will restart when panel opens
            if (terminalRef.current) {
                terminalRef.current.write('\r\n\x1b[33m[Terminal session ended]\x1b[0m\r\n');
            }
        });

        return () => {
            unsubTerminalOutput?.();
            unsubTerminalReady?.();
            unsubTerminalClosed?.();
        };
    }, []);

    // Spawn terminal when tab switches to terminal (with debounce to prevent infinite restart)
    useEffect(() => {
        if (isOpen && activeTab === 'terminal' && !terminalActive) {
            const now = Date.now();
            const timeSinceLastAttempt = now - lastSpawnAttemptRef.current;

            // If last attempt was less than 2 seconds ago, it's likely a rapid failure
            if (timeSinceLastAttempt < 2000) {
                spawnFailCountRef.current++;
                if (spawnFailCountRef.current >= 3) {
                    terminalRef.current?.write('\x1b[31mTerminal spawn failed repeatedly. Please check your configuration.\x1b[0m\r\n');
                    return; // Stop trying after 3 rapid failures
                }
            } else {
                // Reset fail count if enough time has passed
                spawnFailCountRef.current = 0;
            }

            lastSpawnAttemptRef.current = now;
            (window as any).electronAPI?.spawnTerminal?.().catch((err: Error) => {
                terminalRef.current?.write(`\x1b[31mError spawning terminal: ${err.message}\x1b[0m\r\n`);
            });
        }
    }, [isOpen, activeTab, terminalActive]);

    // Fit terminal on panel resize
    useEffect(() => {
        if (isOpen && activeTab === 'terminal' && fitAddonRef.current && terminalRef.current) {
            // Delay fit to allow DOM to update
            setTimeout(() => {
                fitAddonRef.current?.fit();
            }, 50);
        }
    }, [isOpen, activeTab, panelHeight]);

    // Notify main process of bottom panel height changes
    useEffect(() => {
        const height = isOpen ? panelHeight : 0;
        (window as any).electronAPI?.setBottomPanelHeight?.(height);
    }, [isOpen, panelHeight]);

    // Auto-scroll logs
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    // Cleanup terminal on unmount
    useEffect(() => {
        return () => {
            terminalRef.current?.dispose();
            terminalRef.current = null;
            fitAddonRef.current = null;
        };
    }, []);

    // Restart terminal
    const handleRestartTerminal = useCallback(() => {
        if (terminalRef.current) {
            terminalRef.current.clear();
            terminalRef.current.write('\x1b[33mStarting new terminal session...\x1b[0m\r\n');
        }
        (window as any).electronAPI?.spawnTerminal?.().then(() => {
            setTerminalActive(true);
        }).catch((err: Error) => {
            terminalRef.current?.write(`\x1b[31mError: ${err.message}\x1b[0m\r\n`);
        });
    }, []);

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

    return (
        <div className="bottom-panel" style={{ height: panelHeight, display: isOpen ? 'flex' : 'none' }}>
            {/* Resize handle */}
            <div className="bottom-panel-resize" onMouseDown={handleMouseDown} />

            {/* Tab bar */}
            <div className="bottom-panel-tabs">
                <button
                    className={`bottom-panel-tab ${activeTab === 'console' ? 'active' : ''}`}
                    onClick={() => onTabChange('console')}
                >
                    📋 Output
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
                {activeTab === 'terminal' && !terminalActive && (
                    <button className="bottom-panel-action" onClick={handleRestartTerminal} title="Restart Terminal">
                        🔄 Restart
                    </button>
                )}
                <button className="bottom-panel-close" onClick={onClose}>
                    ✕
                </button>
            </div>

            {/* Output content - always mounted, hidden when not active */}
            <div
                className="bottom-panel-content console-content"
                ref={logContainerRef}
                style={{ display: activeTab === 'console' ? 'flex' : 'none', flexDirection: 'column' }}
            >
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

            {/* Terminal content - always mounted, hidden when not active */}
            <div
                className="bottom-panel-content terminal-content"
                ref={terminalContainerRef}
                style={{ display: activeTab === 'terminal' ? 'flex' : 'none', padding: 0 }}
            />
        </div>
    );
};

export default BottomPanel;
