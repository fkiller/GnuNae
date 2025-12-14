import React from 'react';

interface AboutProps {
    isOpen: boolean;
    onClose: () => void;
}

const About: React.FC<AboutProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="settings-overlay">
            <div className="about-panel">
                <div className="settings-header">
                    <h2>About</h2>
                    <button className="settings-close" onClick={onClose}>×</button>
                </div>

                <div className="about-content">
                    <img className="about-logo-img" src="../assets/gnunae.ico" alt="GnuNae" />
                    <h1>GnuNae</h1>
                    <p className="version">Version 1.0.0</p>

                    <p className="about-description">
                        AI-powered browser with Codex sidebar for intelligent web automation.
                    </p>

                    <div className="about-section">
                        <h3>Features</h3>
                        <ul>
                            <li>Full Chromium-based browser</li>
                            <li>AI Codex integration</li>
                            <li>Page analysis & automation</li>
                            <li>MCP tool support</li>
                        </ul>
                    </div>

                    <div className="about-section">
                        <h3>Credits</h3>
                        <p>Built with Electron, React, and OpenAI Codex</p>
                        <p>© 2024 Won Dong</p>
                    </div>

                    <div className="about-links">
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
