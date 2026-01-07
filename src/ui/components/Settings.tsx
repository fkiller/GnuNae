import React, { useState, useEffect } from 'react';
import { CODEX_MODELS, CODEX_MODES, DEFAULT_MODEL, DEFAULT_MODE, getModelLabel } from '../constants/codex';

interface Settings {
    debug: { enabled: boolean };
    browser: { startPage: string; userAgent: string };
    codex: { model: string; mode: 'ask' | 'agent' | 'full-access'; prePrompt: string; prePromptCustomized: boolean };
    ui: { sidebarWidth: number; theme: 'dark' | 'light' | 'system' };
    app?: { runInBackground: boolean; launchHidden: boolean; launchAtStartup: boolean };
    externalBrowsers?: {
        cdpPort: number;
        shortcuts: Array<{
            browserId: string;
            browserName: string;
            shortcutLocations: string[];
            created: boolean;
            createdAt?: string;
        }>;
    };
}

interface DetectedBrowser {
    id: string;
    name: string;
    executablePath: string;
    version?: string;
    supportsCDP: boolean;
}

interface ShortcutLocation {
    id: string;
    label: string;
}

type DataStoreData = Record<string, string | number | boolean>;

interface Task {
    id: string;
    name: string;
    originalPrompt: string;
    optimizedPrompt: string;
    startUrl?: string;
    trigger: { type: string; domain?: string; frequency?: string; timing?: string };
    dataType: string;
    logicType: string;
    mode?: 'ask' | 'agent' | 'full-access';
    createdAt: string;
    lastRunAt?: string;
    lastRunStatus?: string;
    state: Record<string, any>;
    enabled: boolean;
    favorited?: boolean;
}

interface SettingsProps {
    isOpen: boolean;
    onClose: () => void;
}

const Settings: React.FC<SettingsProps> = ({ isOpen, onClose }) => {
    const [settings, setSettings] = useState<Settings | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [dataStore, setDataStore] = useState<DataStoreData>({});
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [tasks, setTasks] = useState<Task[]>([]);
    const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
    const [currentWorkDir, setCurrentWorkDir] = useState<string>('');

    // Docker/Virtual Mode state
    const [dockerAvailable, setDockerAvailable] = useState<boolean | null>(null);
    const [dockerRuntimeInfo, setDockerRuntimeInfo] = useState<any>(null);
    const [sandboxStatus, setSandboxStatus] = useState<any>(null);
    const [isCreatingSandbox, setIsCreatingSandbox] = useState(false);
    const [dockerError, setDockerError] = useState<string | null>(null);

    // External Browser state
    const [detectedBrowsers, setDetectedBrowsers] = useState<DetectedBrowser[]>([]);
    const [createdShortcuts, setCreatedShortcuts] = useState<any[]>([]);
    const [availableLocations, setAvailableLocations] = useState<ShortcutLocation[]>([]);
    const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set(['desktop']));
    const [isCreatingShortcut, setIsCreatingShortcut] = useState<string | null>(null);
    const [shortcutError, setShortcutError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            (window as any).electronAPI?.hideBrowser?.();
            (window as any).electronAPI?.getSettings?.().then((s: Settings | null) => {
                setSettings(s);
                if (s?.debug?.enabled !== undefined) {
                    localStorage.setItem('gnunae-debug', s.debug.enabled ? 'true' : 'false');
                }
            });
            // Load datastore
            (window as any).electronAPI?.getDataStore?.().then((data: DataStoreData) => {
                setDataStore(data || {});
            });
            // Load tasks
            (window as any).electronAPI?.getTasks?.().then((t: Task[]) => {
                setTasks(t || []);
            });
            // Load current LLM working directory
            (window as any).electronAPI?.getLLMWorkDir?.().then((dir: string) => {
                setCurrentWorkDir(dir || '');
            });
            // Load Docker/Virtual Mode status
            (window as any).electronAPI?.isDockerAvailable?.().then((result: { available: boolean }) => {
                setDockerAvailable(result?.available ?? false);
            });
            (window as any).electronAPI?.getDockerRuntimeInfo?.().then((info: any) => {
                setDockerRuntimeInfo(info);
            });
            (window as any).electronAPI?.getSandboxStatus?.().then((status: any) => {
                setSandboxStatus(status);
            });

            // Load External Browsers
            (window as any).electronAPI?.detectBrowsers?.().then((browsers: DetectedBrowser[]) => {
                setDetectedBrowsers(browsers || []);
            });
            (window as any).electronAPI?.getCreatedShortcuts?.().then((shortcuts: any[]) => {
                setCreatedShortcuts(shortcuts || []);
            });
            (window as any).electronAPI?.getShortcutLocations?.().then((locations: ShortcutLocation[]) => {
                setAvailableLocations(locations || []);
                // Default to first location
                if (locations?.length > 0) {
                    setSelectedLocations(new Set([locations[0].id]));
                }
            });

            // Listen for Docker status changes
            const unsubStatus = (window as any).electronAPI?.onDockerStatusChanged?.((data: any) => {
                console.log('[Settings] Docker status changed:', data);
                if (data.active !== undefined) {
                    setSandboxStatus((prev: any) => ({ ...prev, active: data.active }));
                }
                if (data.error) {
                    setDockerError(data.error);
                }
                // If activated or error occurred, we're done creating
                if (data.active || data.error) {
                    setIsCreatingSandbox(false);
                }
            });

            return () => {
                unsubStatus?.();
            };
        } else {
            (window as any).electronAPI?.showBrowser?.();
        }
    }, [isOpen]);

    const updateSetting = (path: string, value: any) => {
        if (!settings) return;
        const keys = path.split('.');
        const newSettings = { ...settings };
        let obj: any = newSettings;
        for (let i = 0; i < keys.length - 1; i++) {
            obj = obj[keys[i]];
        }
        obj[keys[keys.length - 1]] = value;
        if (path === 'debug.enabled') {
            localStorage.setItem('gnunae-debug', value ? 'true' : 'false');
        }
        setSettings(newSettings);
        (window as any).electronAPI?.updateSettings?.(newSettings);
    };

    const addDataStoreEntry = async () => {
        if (!newKey.trim()) return;
        await (window as any).electronAPI?.setDataStoreValue?.(newKey.trim(), newValue);
        setDataStore(prev => ({ ...prev, [newKey.trim()]: newValue }));
        setNewKey('');
        setNewValue('');
    };

    const updateDataStoreEntry = async (key: string) => {
        await (window as any).electronAPI?.setDataStoreValue?.(key, editValue);
        setDataStore(prev => ({ ...prev, [key]: editValue }));
        setEditingKey(null);
        setEditValue('');
    };

    const removeDataStoreEntry = async (key: string) => {
        await (window as any).electronAPI?.removeDataStoreValue?.(key);
        setDataStore(prev => {
            const newData = { ...prev };
            delete newData[key];
            return newData;
        });
    };

    // Docker/Virtual Mode helpers
    const enableVirtualMode = async () => {
        if (!dockerAvailable) return;

        setIsCreatingSandbox(true);
        setDockerError(null);

        try {
            // Create sandbox with electron-cdp mode (connects to Electron's BrowserView)
            const result = await (window as any).electronAPI?.createSandbox?.({
                browserMode: 'electron-cdp',
                externalCdpEndpoint: 'http://host.docker.internal:9222',
            });

            if (result?.success) {
                // Enable Docker mode
                await (window as any).electronAPI?.setDockerMode?.(true);
                // Save preference to settings
                updateSetting('docker.useVirtualMode', true);
                // Refresh status
                const status = await (window as any).electronAPI?.getSandboxStatus?.();
                setSandboxStatus(status);
            } else {
                setDockerError(result?.error || 'Failed to create sandbox');
            }
        } catch (err: any) {
            setDockerError(err.message || 'Failed to enable Virtual Mode');
        } finally {
            setIsCreatingSandbox(false);
        }
    };

    const disableVirtualMode = async () => {
        try {
            await (window as any).electronAPI?.destroySandbox?.();
            // Save preference to settings
            updateSetting('docker.useVirtualMode', false);
            setSandboxStatus({ active: false });
            setDockerError(null);
        } catch (err: any) {
            setDockerError(err.message || 'Failed to disable Virtual Mode');
        }
    };

    if (!isOpen) return null;

    const filterBySearch = (label: string) => {
        if (!searchQuery) return true;
        return label.toLowerCase().includes(searchQuery.toLowerCase());
    };

    return (
        <div className="settings-overlay">
            <div className="settings-panel">
                <div className="settings-header">
                    <h2>Settings</h2>
                    <button className="settings-close" onClick={onClose}>×</button>
                </div>

                <div className="settings-search">
                    <input
                        type="text"
                        placeholder="Search settings..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="settings-content">
                    {/* Execution Backend Section */}
                    {filterBySearch('execution backend docker virtual native mode sandbox container') && (
                        <div className="settings-section">
                            <h3>⚡ Execution Backend</h3>
                            <span className="setting-hint">
                                Choose how Codex CLI executes commands
                            </span>

                            <div className="execution-mode-selector">
                                <button
                                    className={`mode-option ${!sandboxStatus?.active ? 'active' : ''}`}
                                    onClick={disableVirtualMode}
                                    disabled={!sandboxStatus?.active}
                                >
                                    <span className="mode-icon">🖥️</span>
                                    <span className="mode-label">Native Mode</span>
                                    <span className="mode-desc">Runs directly on your system</span>
                                </button>

                                <button
                                    className={`mode-option ${sandboxStatus?.active ? 'active' : ''} ${!dockerAvailable ? 'disabled' : ''}`}
                                    onClick={enableVirtualMode}
                                    disabled={!dockerAvailable || isCreatingSandbox || sandboxStatus?.active}
                                >
                                    <span className="mode-icon">🐳</span>
                                    <span className="mode-label">Virtual Mode</span>
                                    <span className="mode-desc">
                                        {isCreatingSandbox ? 'Starting container...' :
                                            !dockerAvailable ? 'Docker not available' :
                                                'Runs in isolated Docker container'}
                                    </span>
                                </button>
                            </div>

                            {/* Docker Status */}
                            <div className="docker-status">
                                <div className="status-row">
                                    <span className="status-label">Docker:</span>
                                    <span className={`status-value ${dockerAvailable ? 'available' : 'unavailable'}`}>
                                        {dockerAvailable === null ? 'Checking...' :
                                            dockerAvailable ? `✓ ${dockerRuntimeInfo?.type || 'Available'} ${dockerRuntimeInfo?.version || ''}` :
                                                '✗ Not available'}
                                    </span>
                                </div>
                                {sandboxStatus?.active && (
                                    <div className="status-row">
                                        <span className="status-label">Container:</span>
                                        <span className="status-value available">
                                            ✓ Running (Port {sandboxStatus?.sandbox?.apiPort})
                                        </span>
                                    </div>
                                )}
                            </div>

                            {dockerError && (
                                <div className="docker-error">
                                    ⚠️ {dockerError}
                                </div>
                            )}

                            {!dockerAvailable && dockerRuntimeInfo?.reason && (
                                <div className="docker-hint">
                                    💡 {dockerRuntimeInfo.reason}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Application Behavior Section */}
                    {filterBySearch('application background tray minimize hidden') && (
                        <div className="settings-section">
                            <h3>🖥️ Application</h3>
                            <span className="setting-hint">
                                Control how GnuNae behaves when closing windows
                            </span>

                            <div className="settings-item">
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={settings?.app?.runInBackground ?? false}
                                        onChange={(e) => updateSetting('app.runInBackground', e.target.checked)}
                                    />
                                    Run in Background
                                </label>
                                <span className="setting-hint">
                                    When enabled, closing the window minimizes GnuNae to the system tray instead of quitting.
                                    Use the tray icon to show the window again or quit completely.
                                </span>
                            </div>

                            <div className="settings-item">
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={settings?.app?.launchAtStartup ?? false}
                                        onChange={(e) => {
                                            const checked = e.target.checked;
                                            updateSetting('app.launchAtStartup', checked);
                                            // Auto-enable Run in Background when Launch at Startup is enabled
                                            if (checked) {
                                                updateSetting('app.runInBackground', true);
                                            }
                                        }}
                                    />
                                    Launch at Startup
                                </label>
                                <span className="setting-hint">
                                    Start GnuNae automatically when your computer starts.
                                    Enabling this will also enable "Run in Background" so the app starts in system tray.
                                </span>
                            </div>

                        </div>
                    )}

                    {/* External Browsers Section */}
                    {filterBySearch('external browser chrome edge brave shortcut integration cdp') && (
                        <div className="settings-section">
                            <h3>🌐 External Browsers</h3>
                            <span className="setting-hint">
                                Create shortcuts to launch installed browsers with GnuNae AI integration
                            </span>

                            {detectedBrowsers.length === 0 ? (
                                <div className="empty-state">
                                    No Chromium-based browsers detected. Supported browsers: Chrome, Edge, Brave, Chromium, Vivaldi, Opera.
                                </div>
                            ) : (
                                <>
                                    {/* Shortcut placement options */}
                                    {availableLocations.length > 0 && (
                                        <div className="shortcut-location-options">
                                            <span className="setting-label">Shortcut locations:</span>
                                            <div className="location-checkboxes">
                                                {availableLocations.map(loc => (
                                                    <label key={loc.id}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedLocations.has(loc.id)}
                                                            onChange={(e) => {
                                                                const newSet = new Set(selectedLocations);
                                                                if (e.target.checked) {
                                                                    newSet.add(loc.id);
                                                                } else {
                                                                    newSet.delete(loc.id);
                                                                }
                                                                setSelectedLocations(newSet);
                                                            }}
                                                        />
                                                        {loc.label}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {shortcutError && (
                                        <div className="docker-error">
                                            ⚠️ {shortcutError}
                                        </div>
                                    )}

                                    <div className="browser-list">
                                        {detectedBrowsers.map(browser => {
                                            const hasShortcut = createdShortcuts.some(s => s.browserId === browser.id);
                                            const isCreating = isCreatingShortcut === browser.id;

                                            return (
                                                <div key={browser.id} className="browser-item">
                                                    <div className="browser-info">
                                                        <span className="browser-icon">🌐</span>
                                                        <div className="browser-details">
                                                            <span className="browser-name">{browser.name}</span>
                                                            {browser.version && (
                                                                <span className="browser-version">v{browser.version}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="browser-actions">
                                                        {hasShortcut ? (
                                                            <button
                                                                className="shortcut-btn remove"
                                                                onClick={async () => {
                                                                    setShortcutError(null);
                                                                    await (window as any).electronAPI?.removeBrowserShortcut?.(browser.id);
                                                                    // Refresh shortcuts
                                                                    const shortcuts = await (window as any).electronAPI?.getCreatedShortcuts?.();
                                                                    setCreatedShortcuts(shortcuts || []);
                                                                }}
                                                            >
                                                                ✓ Shortcut Created
                                                            </button>
                                                        ) : (
                                                            <button
                                                                className="shortcut-btn create"
                                                                disabled={isCreating || selectedLocations.size === 0}
                                                                onClick={async () => {
                                                                    setIsCreatingShortcut(browser.id);
                                                                    setShortcutError(null);
                                                                    try {
                                                                        const results = await (window as any).electronAPI?.createBrowserShortcut?.(
                                                                            browser.id,
                                                                            browser.name,
                                                                            Array.from(selectedLocations)
                                                                        );
                                                                        const failed = results?.filter((r: any) => !r.success);
                                                                        if (failed?.length > 0) {
                                                                            setShortcutError(failed.map((f: any) => f.error).join(', '));
                                                                        }
                                                                        // Refresh shortcuts
                                                                        const shortcuts = await (window as any).electronAPI?.getCreatedShortcuts?.();
                                                                        setCreatedShortcuts(shortcuts || []);
                                                                    } catch (err: any) {
                                                                        setShortcutError(err.message || 'Failed to create shortcut');
                                                                    } finally {
                                                                        setIsCreatingShortcut(null);
                                                                    }
                                                                }}
                                                            >
                                                                {isCreating ? 'Creating...' : '+ Create Shortcut'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="setting-hint" style={{ marginTop: '12px' }}>
                                        💡 Shortcuts will launch GnuNae in hidden mode (tray only) and open the selected browser with AI integration enabled.
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* DataStore Section */}
                    {filterBySearch('data store personal info') && (
                        <div className="settings-section">
                            <h3>📁 Data Store</h3>
                            <span className="setting-hint">Personal data used by Codex for auto-filling forms</span>

                            <div className="datastore-list">
                                {Object.entries(dataStore).map(([key, value]) => (
                                    <div key={key} className="datastore-item">
                                        <span className="datastore-key">{key}</span>
                                        {editingKey === key ? (
                                            <div className="datastore-edit">
                                                <input
                                                    type="text"
                                                    value={editValue}
                                                    onChange={(e) => setEditValue(e.target.value)}
                                                    autoFocus
                                                />
                                                <button onClick={() => updateDataStoreEntry(key)}>✓</button>
                                                <button onClick={() => setEditingKey(null)}>✗</button>
                                            </div>
                                        ) : (
                                            <div className="datastore-value-row">
                                                <span className="datastore-value">{String(value)}</span>
                                                <button onClick={() => { setEditingKey(key); setEditValue(String(value)); }}>✎</button>
                                                <button onClick={() => removeDataStoreEntry(key)}>🗑</button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="datastore-add">
                                <input
                                    type="text"
                                    placeholder="Key (e.g. user.email)"
                                    value={newKey}
                                    onChange={(e) => setNewKey(e.target.value)}
                                />
                                <input
                                    type="text"
                                    placeholder="Value"
                                    value={newValue}
                                    onChange={(e) => setNewValue(e.target.value)}
                                />
                                <button onClick={addDataStoreEntry}>+ Add</button>
                            </div>
                        </div>
                    )}

                    {/* Tasks Section */}
                    {filterBySearch('tasks automation scheduled concurrency') && (
                        <div className="settings-section">
                            <h3>Task Settings</h3>

                            <div className="settings-row">
                                <label>Max Concurrent Tasks</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="5"
                                    value={settings?.tasks?.maxConcurrency || 1}
                                    onChange={(e) => {
                                        const max = Math.max(1, Math.min(5, parseInt(e.target.value) || 1));
                                        updateSetting('tasks.maxConcurrency', max);
                                        (window as any).electronAPI?.setMaxConcurrency?.(max);
                                    }}
                                />
                            </div>
                            <span className="setting-hint">How many tasks can run at the same time (1-5).</span>

                            <h4 style={{ marginTop: '20px' }}>Saved Tasks</h4>
                            <span className="setting-hint">Click a task to view/edit all properties.</span>

                            {tasks.length === 0 ? (
                                <div className="empty-state">No saved tasks. Use the Task toggle when prompting to create one.</div>
                            ) : (
                                <div className="tasks-list">
                                    {tasks.map(task => (
                                        <div key={task.id} className={`task-card ${expandedTaskId === task.id ? 'expanded' : ''}`}>
                                            <div
                                                className="task-header"
                                                onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                                            >
                                                <div className="task-info">
                                                    <button
                                                        className={`task-favorite-btn ${task.favorited ? 'active' : ''}`}
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            const updated = { ...task, favorited: !task.favorited };
                                                            setTasks(tasks.map(t => t.id === task.id ? updated : t));
                                                            await (window as any).electronAPI?.toggleFavorite?.(task.id);
                                                        }}
                                                        title={task.favorited ? 'Remove from favorites' : 'Add to favorites'}
                                                    >
                                                        {task.favorited ? '★' : '☆'}
                                                    </button>
                                                    <span className="task-name">{task.name}</span>
                                                    <span className="task-trigger">
                                                        {task.trigger.type === 'one-time' && '⏱ One-time'}
                                                        {task.trigger.type === 'on-going' && `📡 ${task.trigger.domain}`}
                                                        {task.trigger.type === 'scheduled' && `📅 ${task.trigger.frequency}`}
                                                    </span>
                                                </div>
                                                <span className="task-expand-icon">{expandedTaskId === task.id ? '▲' : '▼'}</span>
                                            </div>

                                            {expandedTaskId === task.id && (
                                                <div className="task-details">
                                                    <div className="task-field">
                                                        <label>Name</label>
                                                        <input
                                                            type="text"
                                                            value={task.name}
                                                            onChange={async (e) => {
                                                                const updated = { ...task, name: e.target.value };
                                                                setTasks(tasks.map(t => t.id === task.id ? updated : t));
                                                                await (window as any).electronAPI?.updateTask?.(task.id, { name: e.target.value });
                                                            }}
                                                        />
                                                    </div>

                                                    <div className="task-field">
                                                        <label>Original Prompt</label>
                                                        <textarea
                                                            value={task.originalPrompt}
                                                            onChange={async (e) => {
                                                                const updated = { ...task, originalPrompt: e.target.value };
                                                                setTasks(tasks.map(t => t.id === task.id ? updated : t));
                                                                await (window as any).electronAPI?.updateTask?.(task.id, { originalPrompt: e.target.value });
                                                            }}
                                                            rows={2}
                                                        />
                                                    </div>

                                                    <div className="task-field">
                                                        <label>Optimized Prompt</label>
                                                        <textarea
                                                            value={task.optimizedPrompt}
                                                            onChange={async (e) => {
                                                                const updated = { ...task, optimizedPrompt: e.target.value };
                                                                setTasks(tasks.map(t => t.id === task.id ? updated : t));
                                                                await (window as any).electronAPI?.updateTask?.(task.id, { optimizedPrompt: e.target.value });
                                                            }}
                                                            rows={2}
                                                        />
                                                    </div>

                                                    <div className="task-field">
                                                        <label>Start URL</label>
                                                        <input
                                                            type="text"
                                                            value={task.startUrl || ''}
                                                            onChange={async (e) => {
                                                                const updated = { ...task, startUrl: e.target.value };
                                                                setTasks(tasks.map(t => t.id === task.id ? updated : t));
                                                                await (window as any).electronAPI?.updateTask?.(task.id, { startUrl: e.target.value || null });
                                                            }}
                                                            placeholder="https://example.com (optional)"
                                                        />
                                                    </div>

                                                    <div className="task-field-row">
                                                        <div className="task-field">
                                                            <label>Trigger Type</label>
                                                            <select
                                                                value={task.trigger.type}
                                                                onChange={async (e) => {
                                                                    const newTrigger = { type: e.target.value, domain: task.trigger.domain, frequency: task.trigger.frequency };
                                                                    const updated = { ...task, trigger: newTrigger };
                                                                    setTasks(tasks.map(t => t.id === task.id ? updated : t));
                                                                    await (window as any).electronAPI?.updateTask?.(task.id, { trigger: newTrigger });
                                                                }}
                                                            >
                                                                <option value="one-time">One-time</option>
                                                                <option value="on-going">On-going (domain)</option>
                                                                <option value="scheduled">Scheduled</option>
                                                            </select>
                                                        </div>

                                                        <div className="task-field">
                                                            <label>Mode</label>
                                                            <select
                                                                value={task.mode || 'agent'}
                                                                onChange={async (e) => {
                                                                    const updated = { ...task, mode: e.target.value as any };
                                                                    setTasks(tasks.map(t => t.id === task.id ? updated : t));
                                                                    await (window as any).electronAPI?.updateTask?.(task.id, { mode: e.target.value });
                                                                }}
                                                            >
                                                                <option value="ask">Ask (read-only)</option>
                                                                <option value="agent">Agent (confirms)</option>
                                                                <option value="full-access">Full Access</option>
                                                            </select>
                                                        </div>
                                                    </div>

                                                    {task.trigger.type === 'on-going' && (
                                                        <div className="task-field">
                                                            <label>Domain</label>
                                                            <input
                                                                type="text"
                                                                value={task.trigger.domain || ''}
                                                                onChange={async (e) => {
                                                                    const newTrigger = { ...task.trigger, domain: e.target.value };
                                                                    const updated = { ...task, trigger: newTrigger };
                                                                    setTasks(tasks.map(t => t.id === task.id ? updated : t));
                                                                    await (window as any).electronAPI?.updateTask?.(task.id, { trigger: newTrigger });
                                                                }}
                                                                placeholder="e.g., zillow.com"
                                                            />
                                                        </div>
                                                    )}

                                                    {task.trigger.type === 'scheduled' && (
                                                        <div className="task-field-row">
                                                            <div className="task-field">
                                                                <label>Frequency</label>
                                                                <select
                                                                    value={task.trigger.frequency || 'daily'}
                                                                    onChange={async (e) => {
                                                                        const newTrigger = { ...task.trigger, frequency: e.target.value };
                                                                        const updated = { ...task, trigger: newTrigger };
                                                                        setTasks(tasks.map(t => t.id === task.id ? updated : t));
                                                                        await (window as any).electronAPI?.updateTask?.(task.id, { trigger: newTrigger });
                                                                    }}
                                                                >
                                                                    <option value="hourly">Hourly</option>
                                                                    <option value="daily">Daily</option>
                                                                    <option value="weekly">Weekly</option>
                                                                </select>
                                                            </div>
                                                            <div className="task-field">
                                                                <label>Timing</label>
                                                                <input
                                                                    type="time"
                                                                    value={task.trigger.timing || '09:00'}
                                                                    onChange={async (e) => {
                                                                        const newTrigger = { ...task.trigger, timing: e.target.value };
                                                                        const updated = { ...task, trigger: newTrigger };
                                                                        setTasks(tasks.map(t => t.id === task.id ? updated : t));
                                                                        await (window as any).electronAPI?.updateTask?.(task.id, { trigger: newTrigger });
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="task-field">
                                                        <label>Last Run</label>
                                                        <span className="task-readonly">
                                                            {task.lastRunAt ? new Date(task.lastRunAt).toLocaleString() : 'Never'}
                                                            {task.lastRunStatus && ` (✓ ${task.lastRunStatus})`}
                                                        </span>
                                                    </div>

                                                    <div className="task-field">
                                                        <label>Task State</label>
                                                        <pre className="task-state-view">
                                                            {Object.keys(task.state || {}).length > 0
                                                                ? JSON.stringify(task.state, null, 2)
                                                                : '(no state stored)'}
                                                        </pre>
                                                    </div>

                                                    <div className="task-detail-actions">
                                                        <button
                                                            className="task-run-btn"
                                                            onClick={async () => {
                                                                const result = await (window as any).electronAPI?.runTask?.(task.id);
                                                                if (result?.success) {
                                                                    onClose(); // Close settings to see execution
                                                                } else {
                                                                    alert(result?.error || 'Failed to run task');
                                                                }
                                                            }}
                                                        >
                                                            ▶ Run Task
                                                        </button>
                                                        <button
                                                            className="task-delete-btn"
                                                            onClick={async () => {
                                                                if (confirm(`Delete task "${task.name}"?`)) {
                                                                    await (window as any).electronAPI?.deleteTask?.(task.id);
                                                                    setTasks(tasks.filter(t => t.id !== task.id));
                                                                    setExpandedTaskId(null);
                                                                }
                                                            }}
                                                        >
                                                            🗑 Delete Task
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Debug Section */}
                    {filterBySearch('debug') && (
                        <div className="settings-section">
                            <h3>Debug</h3>
                            <div className="settings-item">
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={settings?.debug?.enabled ?? false}
                                        onChange={(e) => updateSetting('debug.enabled', e.target.checked)}
                                    />
                                    Enable debug mode
                                </label>
                                <span className="setting-hint">Show verbose logs in console</span>
                            </div>
                        </div>
                    )}

                    {/* Browser Section */}
                    {filterBySearch('browser start page') && (
                        <div className="settings-section">
                            <h3>Browser</h3>
                            <div className="settings-item">
                                <label>Start Page</label>
                                <input
                                    type="text"
                                    value={settings?.browser?.startPage ?? ''}
                                    onChange={(e) => updateSetting('browser.startPage', e.target.value)}
                                    placeholder="https://www.google.com"
                                />
                            </div>
                            <div className="settings-item">
                                <label>Custom User Agent</label>
                                <input
                                    type="text"
                                    value={settings?.browser?.userAgent ?? ''}
                                    onChange={(e) => updateSetting('browser.userAgent', e.target.value)}
                                    placeholder="Leave empty for default"
                                />
                            </div>
                        </div>
                    )}

                    {/* Codex Section */}
                    {filterBySearch('codex model prompt') && (
                        <div className="settings-section">
                            <h3>Codex</h3>
                            <div className="settings-item">
                                <label>Default Model</label>
                                <select
                                    value={settings?.codex?.model ?? DEFAULT_MODEL}
                                    onChange={(e) => updateSetting('codex.model', e.target.value)}
                                >
                                    {CODEX_MODELS.map(m => (
                                        <option key={m.value} value={m.value}>
                                            {getModelLabel(m.value, (settings?.codex?.model ?? DEFAULT_MODEL) as any)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="settings-item">
                                <label>Default Mode</label>
                                <select
                                    value={settings?.codex?.mode ?? DEFAULT_MODE}
                                    onChange={(e) => updateSetting('codex.mode', e.target.value)}
                                >
                                    {CODEX_MODES.map(m => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="settings-item pre-prompt-item">
                                <label>Pre-Prompt (System Instructions)</label>
                                <span className="setting-hint">Instructions sent before every user message. Clear to reset to default.</span>
                                <textarea
                                    className="pre-prompt-textarea"
                                    value={settings?.codex?.prePrompt ?? ''}
                                    onChange={(e) => {
                                        const newValue = e.target.value;
                                        updateSetting('codex.prePrompt', newValue);

                                        if (newValue.trim() === '') {
                                            // Empty = reset to default
                                            updateSetting('codex.prePromptCustomized', false);
                                        } else if (!settings?.codex?.prePromptCustomized) {
                                            // Non-empty edit = mark as customized
                                            updateSetting('codex.prePromptCustomized', true);
                                        }
                                    }}
                                    rows={10}
                                    placeholder="Enter system instructions... (leave empty for default)"
                                />
                            </div>
                            <div className="settings-item">
                                <label>Working Directory</label>
                                <span className="setting-hint">
                                    Custom directory for LLM execution. Leave empty to use system temp (recommended).
                                </span>
                                <div className="settings-input-group">
                                    <input
                                        type="text"
                                        value={(settings?.codex as any)?.workingDir || currentWorkDir}
                                        onChange={(e) => {
                                            updateSetting('codex.workingDir', e.target.value);
                                            // Refresh current workdir display
                                            (window as any).electronAPI?.getLLMWorkDir?.().then((dir: string) => {
                                                setCurrentWorkDir(dir || '');
                                            });
                                        }}
                                        placeholder="Using system temp directory"
                                    />
                                    <button
                                        className="browse-btn"
                                        onClick={async () => {
                                            const dir = await (window as any).electronAPI?.browseDirectory?.();
                                            if (dir) {
                                                updateSetting('codex.workingDir', dir);
                                                setCurrentWorkDir(dir);
                                            }
                                        }}
                                    >
                                        Browse...
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* UI Section */}
                    {filterBySearch('theme sidebar') && (
                        <div className="settings-section">
                            <h3>User Interface</h3>
                            <div className="settings-item">
                                <label>Theme</label>
                                <select
                                    value={settings?.ui?.theme ?? 'dark'}
                                    onChange={(e) => updateSetting('ui.theme', e.target.value)}
                                >
                                    <option value="dark">Dark</option>
                                    <option value="light">Light</option>
                                    <option value="system">System</option>
                                </select>
                            </div>
                            <div className="settings-item">
                                <label>Sidebar Width</label>
                                <input
                                    type="number"
                                    value={settings?.ui?.sidebarWidth ?? 380}
                                    onChange={(e) => updateSetting('ui.sidebarWidth', parseInt(e.target.value))}
                                    min={280}
                                    max={600}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Settings;

