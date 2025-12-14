import React, { useState, useEffect } from 'react';

interface Settings {
    debug: { enabled: boolean };
    browser: { startPage: string; userAgent: string };
    codex: { model: string; mode: 'ask' | 'agent' | 'full-access' };
    ui: { sidebarWidth: number; theme: 'dark' | 'light' | 'system' };
}

interface SettingsProps {
    isOpen: boolean;
    onClose: () => void;
}

const Settings: React.FC<SettingsProps> = ({ isOpen, onClose }) => {
    const [settings, setSettings] = useState<Settings | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (isOpen) {
            // Hide BrowserView so settings overlay is visible
            (window as any).electronAPI?.hideBrowser?.();
            // Load settings via IPC
            (window as any).electronAPI?.getSettings?.().then(setSettings);
        } else {
            // Show BrowserView when settings closes
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

        setSettings(newSettings);
        window.electronAPI?.updateSettings?.(newSettings);
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
                    {filterBySearch('codex model') && (
                        <div className="settings-section">
                            <h3>Codex</h3>
                            <div className="settings-item">
                                <label>Model</label>
                                <select
                                    value={settings?.codex?.model ?? 'gpt-5.1-codex-max'}
                                    onChange={(e) => updateSetting('codex.model', e.target.value)}
                                >
                                    <option value="o3-mini">o3-mini</option>
                                    <option value="gpt-5.1-codex-max">gpt-5.1-codex-max</option>
                                    <option value="gpt-4.5">gpt-4.5</option>
                                </select>
                            </div>
                            <div className="settings-item">
                                <label>Default Mode</label>
                                <select
                                    value={settings?.codex?.mode ?? 'ask'}
                                    onChange={(e) => updateSetting('codex.mode', e.target.value)}
                                >
                                    <option value="ask">Ask</option>
                                    <option value="agent">Agent</option>
                                    <option value="full-access">Full Access</option>
                                </select>
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
