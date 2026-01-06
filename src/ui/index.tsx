import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ChatModeApp from './ChatModeApp';
import Settings from './components/Settings';
import './App.css';

// Parse URL parameters to detect modes
const urlParams = new URLSearchParams(window.location.search);
const isChatMode = urlParams.get('chatMode') === 'true';
const isSettingsOnly = urlParams.get('settingsOnly') === 'true';
const browserName = urlParams.get('browserName') || 'External Browser';

const root = ReactDOM.createRoot(document.getElementById('root')!);

// Render appropriate component based on mode
if (isSettingsOnly) {
    // Settings-only window
    root.render(
        <React.StrictMode>
            <div className="settings-only-container">
                <Settings isOpen={true} onClose={() => window.close()} />
            </div>
        </React.StrictMode>
    );
} else if (isChatMode) {
    // Chat-only mode for external browser
    root.render(
        <React.StrictMode>
            <ChatModeApp browserName={browserName} />
        </React.StrictMode>
    );
} else {
    // Normal full app
    root.render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
}
