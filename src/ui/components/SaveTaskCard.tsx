import React, { useState } from 'react';

interface SaveTaskCardProps {
    originalPrompt: string;
    currentUrl?: string;  // Current browser URL to use as default startUrl
    onSave: (taskData: {
        name: string;
        originalPrompt: string;
        optimizedPrompt: string;
        startUrl?: string;
        trigger: { type: 'one-time' } | { type: 'on-going'; domain: string } | { type: 'scheduled'; frequency: string; timing?: string };
        dataType: 'unique' | 'stream';
        logicType: 'domain-dependent' | 'domain-independent';
    }) => void;
    onCancel: () => void;
}

const SaveTaskCard: React.FC<SaveTaskCardProps> = ({ originalPrompt, currentUrl, onSave, onCancel }) => {
    const [name, setName] = useState('');
    const [triggerType, setTriggerType] = useState<'one-time' | 'on-going' | 'scheduled'>('one-time');
    const [domain, setDomain] = useState('');
    const [frequency, setFrequency] = useState<'hourly' | 'daily' | 'weekly'>('daily');
    const [timing, setTiming] = useState('09:00');
    const [dataType, setDataType] = useState<'unique' | 'stream'>('unique');
    const [logicType, setLogicType] = useState<'domain-dependent' | 'domain-independent'>('domain-dependent');
    const [optimizedPrompt, setOptimizedPrompt] = useState(originalPrompt);
    const [startUrl, setStartUrl] = useState(currentUrl || '');

    const handleSave = () => {
        if (!name.trim()) return;

        let trigger: any;
        if (triggerType === 'one-time') {
            trigger = { type: 'one-time' };
        } else if (triggerType === 'on-going') {
            if (!domain.trim()) return;
            trigger = { type: 'on-going', domain: domain.trim() };
        } else {
            trigger = { type: 'scheduled', frequency, timing };
        }

        onSave({
            name: name.trim(),
            originalPrompt,
            optimizedPrompt: optimizedPrompt.trim(),
            startUrl: startUrl.trim() || undefined,
            trigger,
            dataType,
            logicType,
        });
    };

    return (
        <div className="save-task-card">
            <div className="task-card-header">
                <span className="task-card-icon">📋</span>
                <span className="task-card-title">Save as Task?</span>
            </div>

            <div className="task-card-body">
                <div className="task-field">
                    <label>Task Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Check Job Listings"
                    />
                </div>

                <div className="task-field">
                    <label>Start URL (optional)</label>
                    <input
                        type="text"
                        value={startUrl}
                        onChange={(e) => setStartUrl(e.target.value)}
                        placeholder="https://example.com (leave empty to start from current page)"
                    />
                </div>

                <div className="task-field">
                    <label>Trigger Type</label>
                    <select value={triggerType} onChange={(e) => setTriggerType(e.target.value as any)}>
                        <option value="one-time">One-time (run once)</option>
                        <option value="on-going">On-going (when visiting domain)</option>
                        <option value="scheduled">Scheduled (hourly/daily/weekly)</option>
                    </select>
                </div>

                {triggerType === 'on-going' && (
                    <div className="task-field">
                        <label>Domain (e.g., indeed.com)</label>
                        <input
                            type="text"
                            value={domain}
                            onChange={(e) => setDomain(e.target.value)}
                            placeholder="example.com"
                        />
                    </div>
                )}

                {triggerType === 'scheduled' && (
                    <>
                        <div className="task-field">
                            <label>Frequency</label>
                            <select value={frequency} onChange={(e) => setFrequency(e.target.value as any)}>
                                <option value="hourly">Hourly</option>
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                            </select>
                        </div>
                        <div className="task-field">
                            <label>Timing</label>
                            <input
                                type="time"
                                value={timing}
                                onChange={(e) => setTiming(e.target.value)}
                            />
                        </div>
                    </>
                )}

                <div className="task-field">
                    <label>Data Type</label>
                    <select value={dataType} onChange={(e) => setDataType(e.target.value as any)}>
                        <option value="unique">Unique (single value)</option>
                        <option value="stream">Stream (time-series)</option>
                    </select>
                </div>

                <div className="task-field">
                    <label>Optimized Prompt</label>
                    <textarea
                        value={optimizedPrompt}
                        onChange={(e) => setOptimizedPrompt(e.target.value)}
                        rows={3}
                        placeholder="Optimized version of the prompt..."
                    />
                </div>
            </div>

            <div className="task-card-actions">
                <button className="task-btn-cancel" onClick={onCancel}>Cancel</button>
                <button
                    className="task-btn-save"
                    onClick={handleSave}
                    disabled={!name.trim() || (triggerType === 'on-going' && !domain.trim())}
                >
                    Save Task
                </button>
            </div>
        </div>
    );
};

export default SaveTaskCard;
