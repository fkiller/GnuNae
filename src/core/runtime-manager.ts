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
     * Windows: resources/runtime (embedded in app)
     * macOS/Linux: ~/Library/Application Support/GnuNae or ~/.config/GnuNae
     */
    getRuntimeBaseDir(): string {
        if (process.platform === 'win32') {
            // Windows: embedded in app resources
            if (app.isPackaged) {
                return path.join(process.resourcesPath, 'runtime');
            } else {
                return path.join(__dirname, '../../resources/runtime');
            }
        } else if (process.platform === 'darwin') {
            // macOS: ~/Library/Application Support/GnuNae/runtime
            return path.join(app.getPath('userData'), 'runtime');
        } else {
            // Linux: ~/.config/GnuNae/runtime
            return path.join(app.getPath('userData'), 'runtime');
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
            // Windows: check resources/codex first
            if (app.isPackaged) {
                codexDir = path.join(process.resourcesPath, 'codex', 'node_modules', '.bin');
            } else {
                codexDir = path.join(__dirname, '../../resources/codex/node_modules/.bin');
            }
            const codexPath = path.join(codexDir, 'codex.cmd');
            if (fs.existsSync(codexPath)) return codexPath;

            // Fallback: check project node_modules
            const fallbackPath = app.isPackaged
                ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '.bin', 'codex.cmd')
                : path.join(__dirname, '../../node_modules/.bin/codex.cmd');
            return fs.existsSync(fallbackPath) ? fallbackPath : null;
        } else {
            // macOS/Linux: check userData codex
            codexDir = path.join(app.getPath('userData'), 'codex', 'node_modules', '.bin');
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
     * Get environment variables with embedded Node.js and Codex CLI in PATH
     */
    getEmbeddedNodeEnv(): NodeJS.ProcessEnv {
        const nodePath = this.getNodePath();
        if (!nodePath) {
            return { ...process.env };
        }

        const nodeDir = path.dirname(nodePath);
        const binDir = process.platform === 'win32' ? nodeDir : path.dirname(nodeDir);
        const nodeBinPath = process.platform === 'win32' ? nodeDir : path.join(binDir, 'bin');

        // Also add Codex CLI bin directory
        const codexPath = this.getCodexPath();
        const codexBinPath = codexPath ? path.dirname(codexPath) : null;

        const currentPath = process.env.PATH || '';
        const separator = process.platform === 'win32' ? ';' : ':';

        // Build PATH: Codex bin (if available) + Node.js bin + existing PATH
        const pathParts = [nodeBinPath];
        if (codexBinPath) {
            pathParts.unshift(codexBinPath);
        }
        const newPath = pathParts.join(separator) + separator + currentPath;

        console.log('[RuntimeManager] getEmbeddedNodeEnv - nodeBinPath:', nodeBinPath);
        console.log('[RuntimeManager] getEmbeddedNodeEnv - codexBinPath:', codexBinPath);

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
     * Uses built-in https/fs modules instead of spawning external node process
     */
    private async downloadNode(): Promise<void> {
        console.log('[RuntimeManager] Downloading Node.js...');

        const targetDir = this.getRuntimeBaseDir();
        const arch = os.arch() === 'arm64' ? 'arm64' : 'x64';
        const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
        const folderName = `node-v${NODE_VERSION}-${platform}-${arch}`;
        const url = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${platform}-${arch}.tar.gz`;

        // Ensure parent directory exists
        const parentDir = path.dirname(targetDir);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }

        const tempFile = path.join(parentDir, `node-v${NODE_VERSION}.tar.gz`);
        const tempExtract = path.join(parentDir, 'node-temp-extract');

        console.log(`[RuntimeManager] Downloading from: ${url}`);
        console.log(`[RuntimeManager] Target: ${targetDir}`);

        // Download the file using https
        await this.downloadFile(url, tempFile);

        console.log('[RuntimeManager] Extracting Node.js...');

        // Clean up temp extract directory if exists
        if (fs.existsSync(tempExtract)) {
            fs.rmSync(tempExtract, { recursive: true, force: true });
        }
        fs.mkdirSync(tempExtract, { recursive: true });

        // Extract using system tar command (available on macOS/Linux)
        try {
            execSync(`tar -xzf "${tempFile}" -C "${tempExtract}"`, { stdio: 'inherit' });
        } catch (err) {
            throw new Error(`Failed to extract Node.js: ${err}`);
        }

        // Move extracted folder to target
        const extractedFolder = path.join(tempExtract, folderName);
        if (!fs.existsSync(extractedFolder)) {
            throw new Error(`Expected folder not found: ${extractedFolder}`);
        }

        if (fs.existsSync(targetDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true });
        }
        fs.renameSync(extractedFolder, targetDir);

        // Cleanup
        fs.rmSync(tempExtract, { recursive: true, force: true });
        fs.unlinkSync(tempFile);

        console.log('[RuntimeManager] Node.js download complete');
    }

    /**
     * Download a file from URL to destination
     */
    private downloadFile(url: string, dest: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const https = require('https');
            const file = fs.createWriteStream(dest);

            const request = https.get(url, (response: any) => {
                // Handle redirects
                if (response.statusCode === 301 || response.statusCode === 302) {
                    file.close();
                    if (fs.existsSync(dest)) fs.unlinkSync(dest);
                    return this.downloadFile(response.headers.location, dest).then(resolve).catch(reject);
                }

                if (response.statusCode !== 200) {
                    file.close();
                    if (fs.existsSync(dest)) fs.unlinkSync(dest);
                    reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                    return;
                }

                const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
                let downloadedBytes = 0;

                response.on('data', (chunk: Buffer) => {
                    downloadedBytes += chunk.length;
                    if (totalBytes > 0) {
                        const percent = Math.floor((downloadedBytes / totalBytes) * 100);
                        if (percent % 20 === 0) {
                            console.log(`[RuntimeManager] Download progress: ${percent}%`);
                        }
                    }
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    console.log('[RuntimeManager] Download complete');
                    resolve();
                });
            });

            request.on('error', (err: Error) => {
                file.close();
                if (fs.existsSync(dest)) fs.unlinkSync(dest);
                reject(err);
            });
        });
    }


    /**
     * Install Codex CLI using the downloaded Node.js
     */
    private async installCodex(): Promise<void> {
        console.log('[RuntimeManager] Installing Codex CLI...');

        const targetDir = app.getPath('userData');
        const nodeExePath = this.getNodePath();

        if (!nodeExePath) {
            throw new Error('Node.js not found. Please download Node.js first.');
        }

        const nodeBinDir = path.dirname(nodeExePath);
        const npmPath = this.getNpmPath();

        if (!npmPath) {
            throw new Error('npm not found in downloaded Node.js.');
        }

        // Create codex installation directory
        const codexDir = path.join(targetDir, 'codex');
        if (!fs.existsSync(codexDir)) {
            fs.mkdirSync(codexDir, { recursive: true });
        }

        console.log(`[RuntimeManager] Installing Codex to: ${codexDir}`);

        // Set up environment with downloaded Node.js in PATH
        const env = this.getEmbeddedNodeEnv();

        return new Promise((resolve, reject) => {
            // Use the downloaded npm to install codex-cli
            const child = spawn(npmPath, [
                'install',
                '@openai/codex',
                '--prefix', codexDir
            ], {
                stdio: 'inherit',
                env: env as { [key: string]: string },
                cwd: codexDir
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
