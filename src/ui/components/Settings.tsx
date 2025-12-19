import React, { useState, useEffect } from 'react';
import { CODEX_MODELS, CODEX_MODES, DEFAULT_MODEL, DEFAULT_MODE, getModelLabel } from '../constants/codex';

interface Settings {
    debug: { enabled: boolean };
    browser: { startPage: string; userAgent: string };
    codex: { model: string; mode: 'ask' | 'agent' | 'full-access'; prePrompt: string; prePromptCustomized: boolean };
    ui: { sidebarWidth: number; theme: 'dark' | 'light' | 'system' };
}

type DataStoreData = Record<string, string | number | boolean>;

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
                                        <option key={m.value} value={m.value}>{getModelLabel(m.value)}</option>
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

