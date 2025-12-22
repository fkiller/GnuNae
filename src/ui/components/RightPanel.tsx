import React from 'react';
import CodexSidebar from './CodexSidebar';
import TaskManager from './TaskManager';

interface RightPanelProps {
    activePanel: 'chat' | 'tasks' | null;
    onPanelChange: (panel: 'chat' | 'tasks' | null) => void;
    // Props passed through to CodexSidebar
    currentUrl: string;
    pageTitle: string;
    isAuthenticated: boolean;
    userEmail: string | null;
    onRequestLogin: () => void;
    onLogout: () => void;
}

const RightPanel: React.FC<RightPanelProps> = ({
    activePanel,
    onPanelChange,
    currentUrl,
    pageTitle,
    isAuthenticated,
    userEmail,
    onRequestLogin,
    onLogout,
}) => {
    // If panel is closed, render nothing
    if (activePanel === null) {
        return null;
    }

    return (
        <div className="right-panel">
            {/* Panel Header with Close Button */}
            <div className="right-panel-header">
                <span className="right-panel-title">
                    {activePanel === 'chat' ? '💬 Chat' : '📋 Task Manager'}
                </span>
                <button
                    className="panel-close-btn"
                    onClick={() => onPanelChange(null)}
                    title="Close Panel"
                >
                    ×
                </button>
            </div>

            {/* Panel Content */}
            <div className="right-panel-content">
                {/* CodexSidebar is always mounted (hidden when not active) so its listeners stay active */}
                <div style={{ display: activePanel === 'chat' ? 'flex' : 'none', flex: 1, flexDirection: 'column' }}>
                    <CodexSidebar
                        currentUrl={currentUrl}
                        pageTitle={pageTitle}
                        isAuthenticated={isAuthenticated}
                        userEmail={userEmail}
                        onRequestLogin={onRequestLogin}
                        onLogout={onLogout}
                    />
                </div>
                {activePanel === 'tasks' && (
                    <TaskManager onClose={() => onPanelChange(null)} />
                )}
            </div>
        </div>
    );
};

export default RightPanel;
