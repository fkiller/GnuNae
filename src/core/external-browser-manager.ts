/**
 * External Browser Manager - Coordinates external browser integration with GnuNae
 * 
 * Manages:
 * - Centralized CDP port allocation (avoids conflicts when shortcuts are clicked multiple times)
 * - Browser process lifecycle
 * - Playwright MCP configuration for external browsers
 */

import { ChildProcess } from 'child_process';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { browserDetector, DetectedBrowser } from './browser-detector';
import { settingsService } from './settings';

export interface ExternalBrowserSession {
    browserId: string;
    browserName: string;
    browserProcess: ChildProcess | null;
    cdpPort: number;
    cdpEndpoint: string;       // Local endpoint: http://127.0.0.1:port
    cdpEndpointDocker: string; // Docker endpoint: http://host.docker.internal:port
    startedAt: Date;
    isConnected: boolean;
}

export class ExternalBrowserManager {
    private static instance: ExternalBrowserManager;
    private activeSession: ExternalBrowserSession | null = null;
    private detectedBrowsers: DetectedBrowser[] = [];
    private browserCache: Map<string, DetectedBrowser> = new Map();

    private constructor() { }

    static getInstance(): ExternalBrowserManager {
        if (!ExternalBrowserManager.instance) {
            ExternalBrowserManager.instance = new ExternalBrowserManager();
        }
        return ExternalBrowserManager.instance;
    }

    /**
     * Initialize browser detection
     */
    async initialize(): Promise<void> {
        this.detectedBrowsers = await browserDetector.detectBrowsers();
        this.browserCache.clear();
        for (const browser of this.detectedBrowsers) {
            this.browserCache.set(browser.id, browser);
        }
        console.log('[ExternalBrowserManager] Initialized with', this.detectedBrowsers.length, 'browsers');
    }

    /**
     * Get all detected browsers
     */
    getDetectedBrowsers(): DetectedBrowser[] {
        return this.detectedBrowsers;
    }

    /**
     * Get a specific browser by ID
     */
    getBrowser(browserId: string): DetectedBrowser | undefined {
        return this.browserCache.get(browserId);
    }

    /**
     * Get the centralized CDP port (from settings)
     */
    getCDPPort(): number {
        const settings = settingsService.getAll();
        return settings.externalBrowsers?.cdpPort || 9223;
    }

    /**
     * Check if an external browser session is active
     */
    hasActiveSession(): boolean {
        return this.activeSession !== null;
    }

    /**
     * Get the active session
     */
    getActiveSession(): ExternalBrowserSession | null {
        return this.activeSession;
    }

    /**
     * Launch an external browser with CDP enabled
     * 
     * If a session is already active:
     * - If same browser: reuse the existing session
     * - If different browser: return error (user must close existing first)
     */
    async launchBrowser(browserId: string): Promise<{
        success: boolean;
        session?: ExternalBrowserSession;
        error?: string;
        reused?: boolean;
    }> {
        const browser = this.browserCache.get(browserId);
        if (!browser) {
            return {
                success: false,
                error: `Browser not found: ${browserId}`,
            };
        }

        const cdpPort = this.getCDPPort();

        // Check if session already exists
        if (this.activeSession) {
            if (this.activeSession.browserId === browserId) {
                // Same browser - check if still running
                const isConnected = await this.checkCDPConnection(cdpPort);
                if (isConnected) {
                    console.log('[ExternalBrowserManager] Reusing existing session for', browserId);
                    this.activeSession.isConnected = true;
                    return {
                        success: true,
                        session: this.activeSession,
                        reused: true,
                    };
                } else {
                    // Session exists but browser was closed externally
                    console.log('[ExternalBrowserManager] Previous session dead, relaunching');
                    this.activeSession = null;
                }
            } else {
                // Different browser requested
                return {
                    success: false,
                    error: `Another browser (${this.activeSession.browserName}) is already running. Please close it first.`,
                };
            }
        }

        // Check if CDP port is already in use by another process
        const portInUse = await this.checkCDPConnection(cdpPort);
        if (portInUse) {
            // Try to use the existing connection
            console.log('[ExternalBrowserManager] CDP port already in use, attempting to connect');
            this.activeSession = {
                browserId,
                browserName: browser.name,
                browserProcess: null,
                cdpPort,
                cdpEndpoint: `http://127.0.0.1:${cdpPort}`,
                cdpEndpointDocker: `http://host.docker.internal:${cdpPort}`,
                startedAt: new Date(),
                isConnected: true,
            };
            return {
                success: true,
                session: this.activeSession,
                reused: true,
            };
        }

        // Launch the browser
        console.log(`[ExternalBrowserManager] Launching ${browser.name} on CDP port ${cdpPort}`);

        try {
            const result = browserDetector.launchBrowserWithCDP(
                browser.executablePath,
                cdpPort,
                {
                    userDataDir: this.getBrowserProfileDir(browserId),
                    additionalArgs: ['https://www.google.com'],
                }
            );

            // Wait for CDP to become available
            const connected = await this.waitForCDPConnection(cdpPort, 15000);
            if (!connected) {
                result.process.kill();
                return {
                    success: false,
                    error: 'Browser launched but CDP connection failed. Try again.',
                };
            }

            this.activeSession = {
                browserId,
                browserName: browser.name,
                browserProcess: result.process,
                cdpPort,
                cdpEndpoint: result.cdpEndpoint,
                cdpEndpointDocker: result.cdpEndpointDocker,
                startedAt: new Date(),
                isConnected: true,
            };

            // NOTE: Playwright MCP config is now passed via -c flag when spawning Codex CLI
            // No need to modify global config.toml - the main.ts spawn adds the CDP endpoint dynamically

            console.log('[ExternalBrowserManager] Browser launched successfully (CDP port:', cdpPort, ')');
            return {
                success: true,
                session: this.activeSession,
            };
        } catch (error: any) {
            console.error('[ExternalBrowserManager] Failed to launch browser:', error);
            return {
                success: false,
                error: error.message || 'Failed to launch browser',
            };
        }
    }

    /**
     * Close the active browser session
     */
    async closeSession(): Promise<{ success: boolean; error?: string }> {
        if (!this.activeSession) {
            return { success: true };
        }

        try {
            if (this.activeSession.browserProcess) {
                this.activeSession.browserProcess.kill();
            }
            this.activeSession = null;
            console.log('[ExternalBrowserManager] Session closed');
            return { success: true };
        } catch (error: any) {
            console.error('[ExternalBrowserManager] Failed to close session:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Get the browser profile directory
     */
    private getBrowserProfileDir(browserId: string): string {
        const baseDir = path.join(os.tmpdir(), 'gnunae-browser-profiles');
        const profileDir = path.join(baseDir, browserId);

        if (!fs.existsSync(profileDir)) {
            fs.mkdirSync(profileDir, { recursive: true });
        }

        return profileDir;
    }

    /**
     * Check if CDP is responding on the given port
     */
    private checkCDPConnection(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const request = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
                resolve(res.statusCode === 200);
                res.destroy();
            });
            request.on('error', () => resolve(false));
            request.setTimeout(2000, () => {
                request.destroy();
                resolve(false);
            });
        });
    }

    /**
     * Wait for CDP to become available
     */
    private async waitForCDPConnection(port: number, timeoutMs: number): Promise<boolean> {
        const startTime = Date.now();
        const pollInterval = 500;

        while (Date.now() - startTime < timeoutMs) {
            const connected = await this.checkCDPConnection(port);
            if (connected) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        return false;
    }

    /**
     * Check if Docker/Virtual Mode is currently active
     */
    private async isDockerModeActive(): Promise<boolean> {
        const settings = settingsService.getAll();
        return settings.docker?.useVirtualMode === true;
    }

    // NOTE: updatePlaywrightConfig() has been removed.
    // CDP endpoint is now passed dynamically via Codex CLI's -c flag at spawn time.
    // This avoids modifying global ~/.codex/config.toml for per-session state.

    /**
     * Get status information for UI display
     */
    getStatus(): {
        hasActiveSession: boolean;
        browserName?: string;
        cdpPort?: number;
        cdpEndpoint?: string;
        startedAt?: Date;
    } {
        if (!this.activeSession) {
            return { hasActiveSession: false };
        }

        return {
            hasActiveSession: true,
            browserName: this.activeSession.browserName,
            cdpPort: this.activeSession.cdpPort,
            cdpEndpoint: this.activeSession.cdpEndpoint,
            startedAt: this.activeSession.startedAt,
        };
    }
}

// Export singleton getter
export function getExternalBrowserManager(): ExternalBrowserManager {
    return ExternalBrowserManager.getInstance();
}
