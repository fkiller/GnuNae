import React, { useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from './ui/dialog';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';

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

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader className="text-center">
                    <div className="mx-auto mb-4">
                        <img
                            className="w-16 h-16 mx-auto"
                            src="../assets/gnunae.ico"
                            alt="GnuNae"
                        />
                    </div>
                    <DialogTitle className="text-xl">GnuNae</DialogTitle>
                    <DialogDescription>Version 0.3.0</DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[50vh]">
                    <div className="space-y-4 pr-4">
                        <p className="text-sm text-muted-foreground text-center">
                            AI-powered browser with Codex sidebar for intelligent web automation.
                        </p>

                        <div className="space-y-2">
                            <h3 className="font-semibold text-sm">Features</h3>
                            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                                <li>Full Chromium-based browser</li>
                                <li>AI Codex integration with OpenAI</li>
                                <li>Page analysis & browser automation</li>
                                <li>Personal Data Store (PDS)</li>
                                <li>MCP tool support</li>
                            </ul>
                        </div>

                        <div className="space-y-2">
                            <h3 className="font-semibold text-sm">Built With</h3>
                            <div className="flex flex-wrap gap-2">
                                {['Electron', 'React', 'TypeScript', 'OpenAI Codex CLI', 'Playwright MCP', 'Vite'].map((tech) => (
                                    <span
                                        key={tech}
                                        className="px-2 py-0.5 text-xs rounded-full bg-secondary text-secondary-foreground"
                                    >
                                        {tech}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="text-center text-xs text-muted-foreground">
                            © 2024 Won Dong
                        </div>

                        <div className="flex justify-center gap-4">
                            <Button variant="link" size="sm" asChild>
                                <a href="https://www.gnunae.com" target="_blank" rel="noreferrer">
                                    Website
                                </a>
                            </Button>
                            <Button variant="link" size="sm" asChild>
                                <a href="https://github.com/fkiller/GnuNae" target="_blank" rel="noreferrer">
                                    GitHub
                                </a>
                            </Button>
                            <Button variant="link" size="sm" asChild>
                                <a href="https://openai.com/codex" target="_blank" rel="noreferrer">
                                    OpenAI Codex
                                </a>
                            </Button>
                        </div>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};

export default About;
