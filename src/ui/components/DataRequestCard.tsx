import React, { useState } from 'react';
import './DataRequestCard.css';

interface DataRequestCardProps {
    dataKey: string;
    message: string;
    onSubmit: (value: string) => void;
    onCancel: () => void;
}

const DataRequestCard: React.FC<DataRequestCardProps> = ({
    dataKey,
    message,
    onSubmit,
    onCancel
}) => {
    const [value, setValue] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (value.trim()) {
            onSubmit(value.trim());
        }
    };

    return (
        <div className="data-request-card">
            <div className="data-request-header">
                <span className="data-request-icon">📋</span>
                <span className="data-request-title">Information Needed</span>
            </div>
            <div className="data-request-body">
                <p className="data-request-message">{message}</p>
                <span className="data-request-key">Will be saved as: {dataKey}</span>
                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        className="data-request-input"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder="Enter value..."
                        autoFocus
                    />
                    <div className="data-request-actions">
                        <button type="button" className="data-request-cancel" onClick={onCancel}>
                            Skip
                        </button>
                        <button type="submit" className="data-request-submit" disabled={!value.trim()}>
                            Save & Continue
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default DataRequestCard;
