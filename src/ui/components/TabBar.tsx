import React from 'react';
import './TabBar.css';

interface TabInfo {
    id: string;
    url: string;
    title: string;
    isActive: boolean;
}

interface TabBarProps {
    tabs: TabInfo[];
    onTabClick: (tabId: string) => void;
    onTabClose: (tabId: string) => void;
    onNewTab: () => void;
}

const TabBar: React.FC<TabBarProps> = ({ tabs, onTabClick, onTabClose, onNewTab }) => {
    return (
        <div className="tab-bar">
            <div className="tab-list">
                {tabs.map((tab) => (
                    <div
                        key={tab.id}
                        className={`tab-item ${tab.isActive ? 'active' : ''}`}
                        onClick={() => onTabClick(tab.id)}
                    >
                        <span className="tab-title" title={tab.url}>
                            {tab.title || 'New Tab'}
                        </span>
                        <button
                            className="tab-close"
                            onClick={(e) => {
                                e.stopPropagation();
                                onTabClose(tab.id);
                            }}
                            title="Close tab"
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>
            <button className="new-tab-btn" onClick={onNewTab} title="New Tab">
                +
            </button>
        </div>
    );
};

export default TabBar;
