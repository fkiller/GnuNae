/**
 * Browser Detector - Detects installed Chromium-based browsers
 * 
 * Scans the system for installed browsers that support Chrome DevTools Protocol (CDP).
 * Returns information about each browser including executable path and version.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync, spawn } from 'child_process';

export interface DetectedBrowser {
    id: string;           // Unique identifier: 'chrome', 'edge', 'brave', etc.
    name: string;         // Display name: 'Google Chrome'
    executablePath: string;
    version?: string;
    iconPath?: string;    // Path to browser icon (for shortcut creation)
    supportsCDP: boolean; // All Chromium-based browsers support CDP
}

// Browser definitions with detection paths
interface BrowserDefinition {
    id: string;
    name: string;
    windows: {
        registryKeys: string[];      // Registry keys to check
        defaultPaths: string[];       // Default installation paths
        executableName: string;
    };
    darwin: {
        appBundleNames: string[];     // .app bundle names to look for
        executablePath: string;       // Path within .app bundle
    };
    linux: {
        commands: string[];           // Command names to check with 'which'
        defaultPaths: string[];       // Default installation paths
    };
}

const BROWSER_DEFINITIONS: BrowserDefinition[] = [
    {
        id: 'chrome',
        name: 'Chrome',
        windows: {
            registryKeys: [
                'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
                'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
            ],
            defaultPaths: [
                '%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe',
                '%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe',
                '%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe',
            ],
            executableName: 'chrome.exe',
        },
        darwin: {
            appBundleNames: ['Google Chrome.app'],
            executablePath: 'Contents/MacOS/Google Chrome',
        },
        linux: {
            commands: ['google-chrome', 'google-chrome-stable', 'chrome'],
            defaultPaths: [
                '/usr/bin/google-chrome',
                '/usr/bin/google-chrome-stable',
                '/opt/google/chrome/chrome',
            ],
        },
    },
    {
        id: 'edge',
        name: 'Edge',
        windows: {
            registryKeys: [
                'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe',
            ],
            defaultPaths: [
                '%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe',
                '%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe',
            ],
            executableName: 'msedge.exe',
        },
        darwin: {
            appBundleNames: ['Microsoft Edge.app'],
            executablePath: 'Contents/MacOS/Microsoft Edge',
        },
        linux: {
            commands: ['microsoft-edge', 'microsoft-edge-stable'],
            defaultPaths: [
                '/usr/bin/microsoft-edge',
                '/usr/bin/microsoft-edge-stable',
                '/opt/microsoft/msedge/msedge',
            ],
        },
    },
    {
        id: 'brave',
        name: 'Brave',
        windows: {
            registryKeys: [
                'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\brave.exe',
            ],
            defaultPaths: [
                '%ProgramFiles%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
                '%LocalAppData%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
            ],
            executableName: 'brave.exe',
        },
        darwin: {
            appBundleNames: ['Brave Browser.app'],
            executablePath: 'Contents/MacOS/Brave Browser',
        },
        linux: {
            commands: ['brave', 'brave-browser'],
            defaultPaths: [
                '/usr/bin/brave',
                '/usr/bin/brave-browser',
                '/opt/brave.com/brave/brave',
            ],
        },
    },
    {
        id: 'chromium',
        name: 'Chromium',
        windows: {
            registryKeys: [],
            defaultPaths: [
                '%LocalAppData%\\Chromium\\Application\\chrome.exe',
            ],
            executableName: 'chrome.exe',
        },
        darwin: {
            appBundleNames: ['Chromium.app'],
            executablePath: 'Contents/MacOS/Chromium',
        },
        linux: {
            commands: ['chromium', 'chromium-browser'],
            defaultPaths: [
                '/usr/bin/chromium',
                '/usr/bin/chromium-browser',
                '/snap/bin/chromium',
            ],
        },
    },
    {
        id: 'vivaldi',
        name: 'Vivaldi',
        windows: {
            registryKeys: [],
            defaultPaths: [
                '%LocalAppData%\\Vivaldi\\Application\\vivaldi.exe',
                '%ProgramFiles%\\Vivaldi\\Application\\vivaldi.exe',
            ],
            executableName: 'vivaldi.exe',
        },
        darwin: {
            appBundleNames: ['Vivaldi.app'],
            executablePath: 'Contents/MacOS/Vivaldi',
        },
        linux: {
            commands: ['vivaldi', 'vivaldi-stable'],
            defaultPaths: [
                '/usr/bin/vivaldi',
                '/usr/bin/vivaldi-stable',
                '/opt/vivaldi/vivaldi',
            ],
        },
    },
    {
        id: 'opera',
        name: 'Opera',
        windows: {
            registryKeys: [],
            defaultPaths: [
                '%LocalAppData%\\Programs\\Opera\\launcher.exe',
                '%ProgramFiles%\\Opera\\launcher.exe',
            ],
            executableName: 'launcher.exe',
        },
        darwin: {
            appBundleNames: ['Opera.app'],
            executablePath: 'Contents/MacOS/Opera',
        },
        linux: {
            commands: ['opera'],
            defaultPaths: [
                '/usr/bin/opera',
                '/opt/opera/opera',
            ],
        },
    },
];

export class BrowserDetector {
    private platform: NodeJS.Platform;

    constructor() {
        this.platform = process.platform;
    }

    /**
     * Detect all installed browsers
     */
    async detectBrowsers(): Promise<DetectedBrowser[]> {
        const browsers: DetectedBrowser[] = [];

        for (const definition of BROWSER_DEFINITIONS) {
            const browser = await this.detectBrowser(definition);
            if (browser) {
                browsers.push(browser);
            }
        }

        console.log(`[BrowserDetector] Detected ${browsers.length} browsers:`,
            browsers.map(b => b.name).join(', '));

        return browsers;
    }

    /**
     * Detect a specific browser
     */
    private async detectBrowser(definition: BrowserDefinition): Promise<DetectedBrowser | null> {
        let executablePath: string | null = null;

        switch (this.platform) {
            case 'win32':
                executablePath = this.detectWindowsBrowser(definition);
                break;
            case 'darwin':
                executablePath = this.detectMacOSBrowser(definition);
                break;
            case 'linux':
                executablePath = this.detectLinuxBrowser(definition);
                break;
        }

        if (!executablePath) {
            return null;
        }

        // Get version if possible
        const version = await this.getBrowserVersion(executablePath);

        return {
            id: definition.id,
            name: definition.name,
            executablePath,
            version,
            supportsCDP: true, // All Chromium-based browsers support CDP
        };
    }

    /**
     * Detect browser on Windows
     */
    private detectWindowsBrowser(definition: BrowserDefinition): string | null {
        const { registryKeys, defaultPaths } = definition.windows;

        // Try registry keys first
        for (const key of registryKeys) {
            try {
                const result = execSync(`reg query "${key}" /ve`, {
                    encoding: 'utf8',
                    windowsHide: true,
                    stdio: ['pipe', 'pipe', 'pipe'], // Suppress stderr output
                });
                // Parse the registry output to find the path
                const match = result.match(/REG_SZ\s+(.+)/);
                if (match && match[1]) {
                    const path = match[1].trim();
                    if (fs.existsSync(path)) {
                        return path;
                    }
                }
            } catch {
                // Registry key not found, continue silently
            }
        }

        // Try default paths
        for (const pathTemplate of defaultPaths) {
            const resolvedPath = this.expandWindowsPath(pathTemplate);
            if (fs.existsSync(resolvedPath)) {
                return resolvedPath;
            }
        }

        return null;
    }

    /**
     * Detect browser on macOS
     */
    private detectMacOSBrowser(definition: BrowserDefinition): string | null {
        const { appBundleNames, executablePath: relExePath } = definition.darwin;

        const searchPaths = [
            '/Applications',
            path.join(os.homedir(), 'Applications'),
        ];

        for (const searchPath of searchPaths) {
            for (const bundleName of appBundleNames) {
                const appPath = path.join(searchPath, bundleName);
                if (fs.existsSync(appPath)) {
                    const fullExePath = path.join(appPath, relExePath);
                    if (fs.existsSync(fullExePath)) {
                        return fullExePath;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Detect browser on Linux
     */
    private detectLinuxBrowser(definition: BrowserDefinition): string | null {
        const { commands, defaultPaths } = definition.linux;

        // Try 'which' command first
        for (const cmd of commands) {
            try {
                const result = execSync(`which ${cmd}`, {
                    encoding: 'utf8',
                    stdio: ['pipe', 'pipe', 'pipe'],
                });
                const foundPath = result.trim();
                if (foundPath && fs.existsSync(foundPath)) {
                    return foundPath;
                }
            } catch {
                // Command not found, continue
            }
        }

        // Try default paths
        for (const defaultPath of defaultPaths) {
            if (fs.existsSync(defaultPath)) {
                return defaultPath;
            }
        }

        return null;
    }

    /**
     * Expand Windows environment variables in path
     */
    private expandWindowsPath(pathTemplate: string): string {
        return pathTemplate.replace(/%([^%]+)%/g, (_, varName) => {
            return process.env[varName] || '';
        });
    }

    /**
     * Get browser version
     */
    private async getBrowserVersion(executablePath: string): Promise<string | undefined> {
        try {
            if (this.platform === 'win32') {
                // Use PowerShell to get file version (wmic is deprecated in newer Windows)
                const psCommand = `(Get-Item '${executablePath.replace(/'/g, "''")}').VersionInfo.FileVersion`;
                try {
                    const result = execSync(
                        `powershell -NoProfile -Command "${psCommand}"`,
                        { encoding: 'utf8', windowsHide: true, timeout: 5000 }
                    );
                    const version = result.trim();
                    if (version && version !== '') {
                        return version;
                    }
                } catch {
                    // PowerShell failed, try reading from file directly
                    console.log(`[BrowserDetector] PowerShell version check failed for ${executablePath}`);
                }
                return undefined;
            } else {
                // On macOS/Linux, run browser with --version
                const result = execSync(`"${executablePath}" --version`, {
                    encoding: 'utf8',
                    timeout: 5000,
                });
                // Extract version number from output
                const versionMatch = result.match(/[\d]+\.[\d]+\.[\d]+/);
                return versionMatch ? versionMatch[0] : undefined;
            }
        } catch (error) {
            console.log(`[BrowserDetector] Could not get version for ${executablePath}`);
            return undefined;
        }
    }

    /**
     * Launch a browser with CDP enabled
     * 
     * @param executablePath - Path to browser executable
     * @param cdpPort - Port for CDP
     * @param options.userDataDir - Custom user data directory
     * @param options.additionalArgs - Extra command line arguments
     * @param options.forDocker - If true, return endpoint for Docker container (host.docker.internal)
     */
    launchBrowserWithCDP(
        executablePath: string,
        cdpPort: number,
        options?: {
            userDataDir?: string;
            additionalArgs?: string[];
            forDocker?: boolean;
        }
    ): { process: ReturnType<typeof spawn>; cdpEndpoint: string; cdpEndpointDocker: string } {
        const args = [
            `--remote-debugging-port=${cdpPort}`,
            // Bind to 0.0.0.0 to allow Docker container access via host.docker.internal
            '--remote-debugging-address=0.0.0.0',
            // Allow Docker Desktop's internal IPs to connect to CDP
            // Docker Desktop uses 192.168.65.* for host.docker.internal on Windows/macOS
            // and 172.17.* for Linux bridge network
            '--remote-allow-origins=http://192.168.65.*,http://172.17.*,http://127.0.0.1',
        ];

        // Add user data dir to isolate the profile
        if (options?.userDataDir) {
            args.push(`--user-data-dir=${options.userDataDir}`);
        } else {
            // Create a GnuNae-specific profile directory
            const profileDir = path.join(os.tmpdir(), 'gnunae-browser-profile');
            args.push(`--user-data-dir=${profileDir}`);
        }

        // Add any additional arguments
        if (options?.additionalArgs) {
            args.push(...options.additionalArgs);
        }

        console.log(`[BrowserDetector] Launching browser: ${executablePath} with args:`, args);

        const browserProcess = spawn(executablePath, args, {
            detached: false,
            stdio: 'ignore',
        });

        browserProcess.on('error', (err) => {
            console.error('[BrowserDetector] Failed to launch browser:', err);
        });

        // Return both local and Docker-compatible endpoints
        return {
            process: browserProcess,
            cdpEndpoint: `http://127.0.0.1:${cdpPort}`,
            cdpEndpointDocker: `http://host.docker.internal:${cdpPort}`,
        };
    }

    /**
     * Check if a CDP port is already in use
     */
    async isCDPPortInUse(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const http = require('http');
            const request = http.get(`http://127.0.0.1:${port}/json/version`, (res: any) => {
                resolve(true);
                res.destroy();
            });
            request.on('error', () => resolve(false));
            request.setTimeout(1000, () => {
                request.destroy();
                resolve(false);
            });
        });
    }
}

// Export singleton instance
export const browserDetector = new BrowserDetector();
