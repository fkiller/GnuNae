/**
 * Runtime Manager - Manages Node.js and Codex CLI installation/validation
 * 
 * Windows: Uses embedded Node.js from resources/node
 * macOS: Downloads to ~/Library/Application Support/GnuNae/node on first run
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { app } from 'electron';
import { execSync, spawn } from 'child_process';

export interface RuntimeStatus {
    node: {
        installed: boolean;
        version?: string;
        path?: string;
    };
    npm: {
        installed: boolean;
        version?: string;
    };
    codex: {
        installed: boolean;
        version?: string;
        path?: string;
    };
    ready: boolean;
    error?: string;
    platform: 'win32' | 'darwin' | 'linux';
}

// Expected Node.js version
const NODE_VERSION = '22.21.1';

class RuntimeManager {
    private status: RuntimeStatus;
    private listeners: Array<(status: RuntimeStatus) => void> = [];

    constructor() {
        this.status = {
            node: { installed: false },
            npm: { installed: false },
            codex: { installed: false },
            ready: false,
            platform: process.platform as 'win32' | 'darwin' | 'linux'
        };
    }

    /**
     * Get the base directory for runtime files
     * Windows: resources/node (embedded in app)
     * macOS/Linux: ~/Library/Application Support/GnuNae or ~/.config/GnuNae
     */
    getRuntimeBaseDir(): string {
        if (process.platform === 'win32') {
            // Windows: embedded in app resources
            if (app.isPackaged) {
                return path.join(process.resourcesPath, 'node');
            } else {
                return path.join(__dirname, '../../resources/node');
            }
        } else if (process.platform === 'darwin') {
            // macOS: ~/Library/Application Support/GnuNae
            return path.join(app.getPath('userData'), 'node');
        } else {
            // Linux: ~/.config/GnuNae
            return path.join(app.getPath('userData'), 'node');
        }
    }

    /**
     * Get path to the Node.js executable
     */
    getNodePath(): string | null {
        const baseDir = this.getRuntimeBaseDir();

        if (process.platform === 'win32') {
            const nodePath = path.join(baseDir, 'node.exe');
            return fs.existsSync(nodePath) ? nodePath : null;
        } else {
            const nodePath = path.join(baseDir, 'bin', 'node');
            return fs.existsSync(nodePath) ? nodePath : null;
        }
    }

    /**
     * Get path to npm
     */
    getNpmPath(): string | null {
        const baseDir = this.getRuntimeBaseDir();

        if (process.platform === 'win32') {
            const npmPath = path.join(baseDir, 'npm.cmd');
            return fs.existsSync(npmPath) ? npmPath : null;
        } else {
            const npmPath = path.join(baseDir, 'bin', 'npm');
            return fs.existsSync(npmPath) ? npmPath : null;
        }
    }

    /**
     * Get path to Codex CLI
     */
    getCodexPath(): string | null {
        let codexDir: string;

        if (process.platform === 'win32') {
            // Windows: check resources/node_modules first, then resources
            if (app.isPackaged) {
                codexDir = path.join(process.resourcesPath, 'node_modules', '.bin');
            } else {
                codexDir = path.join(__dirname, '../../resources/node_modules/.bin');
            }
            const codexPath = path.join(codexDir, 'codex.cmd');
            if (fs.existsSync(codexPath)) return codexPath;

            // Fallback: check project node_modules
            const fallbackPath = app.isPackaged
                ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '.bin', 'codex.cmd')
                : path.join(__dirname, '../../node_modules/.bin/codex.cmd');
            return fs.existsSync(fallbackPath) ? fallbackPath : null;
        } else {
            // macOS/Linux: check userData node_modules
            codexDir = path.join(app.getPath('userData'), 'node_modules', '.bin');
            const codexPath = path.join(codexDir, 'codex');
            if (fs.existsSync(codexPath)) return codexPath;

            // Fallback: check project node_modules
            const fallbackPath = app.isPackaged
                ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '.bin', 'codex')
                : path.join(__dirname, '../../node_modules/.bin/codex');
            return fs.existsSync(fallbackPath) ? fallbackPath : null;
        }
    }

    /**
     * Get environment variables with embedded Node.js in PATH
     */
    getEmbeddedNodeEnv(): NodeJS.ProcessEnv {
        const nodePath = this.getNodePath();
        if (!nodePath) {
            return { ...process.env };
        }

        const nodeDir = path.dirname(nodePath);
        const binDir = process.platform === 'win32' ? nodeDir : path.dirname(nodeDir);
        const pathToAdd = process.platform === 'win32' ? nodeDir : path.join(binDir, 'bin');

        const currentPath = process.env.PATH || '';
        const separator = process.platform === 'win32' ? ';' : ':';
        const newPath = `${pathToAdd}${separator}${currentPath}`;

        return {
            ...process.env,
            PATH: newPath,
            NODE_PATH: path.join(nodeDir, 'node_modules')
        };
    }

    /**
     * Validate the runtime environment
     */
    async validateRuntime(): Promise<RuntimeStatus> {
        console.log('[RuntimeManager] Validating runtime...');

        const status: RuntimeStatus = {
            node: { installed: false },
            npm: { installed: false },
            codex: { installed: false },
            ready: false,
            platform: process.platform as 'win32' | 'darwin' | 'linux'
        };

        // Check Node.js
        const nodePath = this.getNodePath();
        if (nodePath) {
            try {
                const version = execSync(`"${nodePath}" --version`, { encoding: 'utf8' }).trim();
                status.node = { installed: true, version, path: nodePath };
                console.log(`[RuntimeManager] Node.js: ${version}`);
            } catch (e) {
                console.log('[RuntimeManager] Node.js found but failed to get version');
            }
        } else {
            console.log('[RuntimeManager] Node.js not found');
        }

        // Check npm
        const npmPath = this.getNpmPath();
        if (npmPath && status.node.installed) {
            try {
                const env = this.getEmbeddedNodeEnv();
                const version = execSync(`"${npmPath}" --version`, { encoding: 'utf8', env }).trim();
                status.npm = { installed: true, version: `v${version}` };
                console.log(`[RuntimeManager] npm: v${version}`);
            } catch (e) {
                console.log('[RuntimeManager] npm found but failed to get version');
            }
        }

        // Check Codex
        const codexPath = this.getCodexPath();
        if (codexPath) {
            try {
                const env = this.getEmbeddedNodeEnv();
                const version = execSync(`"${codexPath}" --version`, { encoding: 'utf8', env }).trim();
                status.codex = { installed: true, version, path: codexPath };
                console.log(`[RuntimeManager] Codex: ${version}`);
            } catch (e) {
                console.log('[RuntimeManager] Codex found but failed to get version');
                status.codex = { installed: true, version: 'unknown', path: codexPath };
            }
        } else {
            console.log('[RuntimeManager] Codex not found');
        }

        status.ready = status.node.installed && status.npm.installed && status.codex.installed;
        this.status = status;
        this.notifyListeners();

        return status;
    }

    /**
     * Ensure runtime is installed (downloads/installs if needed)
     * This is mainly for macOS where we download at runtime
     */
    async ensureRuntime(): Promise<RuntimeStatus> {
        // First validate current state
        await this.validateRuntime();

        if (this.status.ready) {
            return this.status;
        }

        // On Windows, runtime should be embedded - just return current status
        if (process.platform === 'win32') {
            if (!this.status.node.installed) {
                this.status.error = 'Node.js not found in package. Please reinstall GnuNae.';
            }
            return this.status;
        }

        // On macOS/Linux, we need to download Node.js and install Codex
        try {
            if (!this.status.node.installed) {
                await this.downloadNode();
            }

            if (!this.status.codex.installed) {
                await this.installCodex();
            }

            // Re-validate
            await this.validateRuntime();
        } catch (error: any) {
            this.status.error = error.message;
            console.error('[RuntimeManager] Failed to ensure runtime:', error);
        }

        return this.status;
    }

    /**
     * Download Node.js for macOS/Linux
     */
    private async downloadNode(): Promise<void> {
        console.log('[RuntimeManager] Downloading Node.js...');

        const targetDir = this.getRuntimeBaseDir();
        const scriptPath = app.isPackaged
            ? path.join(process.resourcesPath, 'scripts', 'download-node.js')
            : path.join(__dirname, '../../scripts/download-node.js');

        if (!fs.existsSync(scriptPath)) {
            throw new Error(`Download script not found: ${scriptPath}`);
        }

        return new Promise((resolve, reject) => {
            const child = spawn('node', [scriptPath, '--target', targetDir], {
                stdio: 'inherit'
            });

            child.on('close', (code) => {
                if (code === 0) {
                    console.log('[RuntimeManager] Node.js download complete');
                    resolve();
                } else {
                    reject(new Error(`Node.js download failed with code ${code}`));
                }
            });

            child.on('error', reject);
        });
    }

    /**
     * Install Codex CLI
     */
    private async installCodex(): Promise<void> {
        console.log('[RuntimeManager] Installing Codex CLI...');

        const targetDir = app.getPath('userData');
        const nodePath = path.dirname(this.getNodePath() || '');
        const scriptPath = app.isPackaged
            ? path.join(process.resourcesPath, 'scripts', 'install-codex.js')
            : path.join(__dirname, '../../scripts/install-codex.js');

        if (!fs.existsSync(scriptPath)) {
            throw new Error(`Install script not found: ${scriptPath}`);
        }

        return new Promise((resolve, reject) => {
            const child = spawn('node', [
                scriptPath,
                '--target', targetDir,
                '--node-path', nodePath
            ], {
                stdio: 'inherit'
            });

            child.on('close', (code) => {
                if (code === 0) {
                    console.log('[RuntimeManager] Codex installation complete');
                    resolve();
                } else {
                    reject(new Error(`Codex installation failed with code ${code}`));
                }
            });

            child.on('error', reject);
        });
    }

    /**
     * Get current status
     */
    getStatus(): RuntimeStatus {
        return { ...this.status };
    }

    /**
     * Add listener for status changes
     */
    onStatusChange(listener: (status: RuntimeStatus) => void): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notifyListeners(): void {
        for (const listener of this.listeners) {
            listener(this.status);
        }
    }
}

// Singleton instance
let runtimeManager: RuntimeManager | null = null;

export function getRuntimeManager(): RuntimeManager {
    if (!runtimeManager) {
        runtimeManager = new RuntimeManager();
    }
    return runtimeManager;
}

export { RuntimeManager };
