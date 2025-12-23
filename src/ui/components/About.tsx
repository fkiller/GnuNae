import React, { useEffect } from 'react';

interface AboutProps {
    isOpen: boolean;
    onClose: () => void;
}

const About: React.FC<AboutProps> = ({ isOpen, onClose }) => {
    useEffect(() => {
        if (isOpen) {
            (window as any).electronAPI?.hideBrowser?.();
        } else {
            (window as any).electronAPI?.showBrowser?.();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="about-overlay" onClick={onClose}>
            <div className="about-panel" onClick={(e) => e.stopPropagation()}>
                <div className="settings-header">
                    <h2>About GnuNae</h2>
                    <button className="settings-close" onClick={onClose}>×</button>
                </div>

                <div className="about-content">
                    <img className="about-logo-img" src="../assets/gnunae.ico" alt="GnuNae" />
                    <h1>GnuNae</h1>
                    <p className="version">Version 0.3.0</p>

                    <p className="about-description">
                        AI-powered browser with Codex sidebar for intelligent web automation.
                    </p>

                    <div className="about-section">
                        <h3>Features</h3>
                        <ul>
                            <li>Full Chromium-based browser</li>
                            <li>AI Codex integration with OpenAI</li>
                            <li>Page analysis & browser automation</li>
                            <li>Personal Data Store (PDS)</li>
                            <li>MCP tool support</li>
                        </ul>
                    </div>

                    <div className="about-section">
                        <h3>Built With</h3>
                        <ul className="dependencies-list">
                            <li>Electron</li>
                            <li>React</li>
                            <li>TypeScript</li>
                            <li>OpenAI Codex CLI</li>
                            <li>Playwright MCP</li>
                            <li>Vite</li>
                        </ul>
                    </div>

                    <div className="about-section">
                        <h3>Credits</h3>
                        <p>© 2024 Won Dong</p>
                    </div>

                    <div className="about-links">
                        <a href="https://www.gnunae.com" target="_blank" rel="noreferrer">
                            Website
                        </a>
                        <span>•</span>
                        <a href="https://github.com/fkiller/GnuNae" target="_blank" rel="noreferrer">
                            GitHub
                        </a>
                        <span>•</span>
                        <a href="https://openai.com/codex" target="_blank" rel="noreferrer">
                            OpenAI Codex
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default About;
