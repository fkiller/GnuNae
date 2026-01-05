/**
 * Docker Manager - Container lifecycle management for GnuNae sandboxes
 * 
 * This module manages the creation, monitoring, and cleanup of Docker containers
 * that provide isolated execution environments for Codex CLI and Playwright.
 */

import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import * as net from 'net';
import { detectContainerRuntime, type ContainerRuntimeType, type RuntimeInfo } from './runtime-detector';

const execFileAsync = promisify(execFile);

/**
 * Configuration for the Docker Manager
 */
export interface DockerManagerConfig {
    /** Docker image name for sandbox containers */
    imageName: string;
    /** Preferred runtime: 'docker', 'podman', or 'auto' */
    preferredRuntime: ContainerRuntimeType | 'auto';
    /** Starting port for dynamic allocation */
    portRangeStart: number;
    /** Ending port for dynamic allocation */
    portRangeEnd: number;
    /** Maximum number of concurrent sandbox instances */
    maxInstances: number;
    /** Default memory limit per container (e.g., '2g') */
    defaultMemoryLimit: string;
    /** Default CPU limit per container (e.g., '2') */
    defaultCpuLimit: string;
    /** Enable VNC streaming by default */
    enableVnc: boolean;
}

/**
 * Browser mode for sandbox operation
 * 
 * - 'headless': Container runs its own headless Chromium (for VNC streaming)
 * - 'electron-cdp': Container's Playwright connects to Electron's BrowserView via CDP
 * - 'external-cdp': Container's Playwright connects to an external browser via CDP
 */
export type BrowserMode = 'headless' | 'electron-cdp' | 'external-cdp';

/**
 * Configuration for creating a sandbox instance
 */
export interface SandboxConfig {
    /** Optional custom name for the container */
    name?: string;
    /** Memory limit override (e.g., '4g') */
    memoryLimit?: string;
    /** CPU limit override (e.g., '4') */
    cpuLimit?: string;
    /** Enable VNC for this instance */
    enableVnc?: boolean;
    /** Environment variables to pass to container */
    env?: Record<string, string>;
    /** Volumes to mount (host:container format) */
    volumes?: string[];

    // ======= NEW: Browser Mode Configuration =======

    /** Browser mode: 'headless', 'electron-cdp', or 'external-cdp' */
    browserMode?: BrowserMode;

    /**
     * External CDP endpoint URL (required for 'electron-cdp' and 'external-cdp' modes)
     * Example: 'http://host.docker.internal:9222' for Electron
     * Example: 'http://192.168.1.100:9222' for external browser
     */
    externalCdpEndpoint?: string;

    // ======= NEW: Auth Token Passthrough =======

    /**
     * Mount the host's auth.json file into the container.
     * Only auth.json is mounted (not config.toml or other files)
     * to keep the container isolated from host's Codex configurations.
     * Default: true (mount ~/.codex/auth.json as read-only)
     */
    mountCodexAuth?: boolean;

    /**
     * Path to Codex auth directory on host (default: ~/.codex)
     * The auth.json file will be looked for in this directory.
     */
    codexAuthPath?: string;
}

/**
 * Status of a sandbox instance
 */
export type SandboxStatus = 'creating' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

/**
 * Information about a running sandbox instance
 */
export interface SandboxInstance {
    /** Unique identifier for this sandbox */
    id: string;
    /** Docker container ID */
    containerId: string;
    /** Container name */
    containerName: string;
    /** CDP debugging port (for headless mode, this is the container's browser) */
    cdpPort: number;
    /** API server port for Codex commands */
    apiPort: number;
    /** VNC port (if enabled) */
    vncPort?: number;
    /** noVNC web port (if enabled) */
    noVncPort?: number;
    /** Current status */
    status: SandboxStatus;
    /** When the sandbox was created */
    createdAt: Date;
    /** Error message if status is 'error' */
    error?: string;
    /** Health check info */
    health?: {
        lastCheck: Date;
        healthy: boolean;
    };
    /** Browser mode configuration */
    browserMode: BrowserMode;
    /** External CDP endpoint (for electron-cdp or external-cdp modes) */
    externalCdpEndpoint?: string;
}

/**
 * Events emitted by DockerManager
 */
export interface DockerManagerEvents {
    'instance-created': (instance: SandboxInstance) => void;
    'instance-started': (instance: SandboxInstance) => void;
    'instance-stopped': (instance: SandboxInstance) => void;
    'instance-error': (instance: SandboxInstance, error: Error) => void;
    'runtime-detected': (runtime: RuntimeInfo) => void;
    'runtime-unavailable': (reason: string) => void;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: DockerManagerConfig = {
    // Local image name for development
    // After CI runs, this can be changed to: ghcr.io/fkiller/gnunae/sandbox:latest
    imageName: 'gnunae/sandbox:latest',
    preferredRuntime: 'auto',
    portRangeStart: 10000,
    portRangeEnd: 10999,
    maxInstances: 10,
    defaultMemoryLimit: '2g',
    defaultCpuLimit: '2',
    enableVnc: false,
};

/**
 * Docker Manager class for managing sandbox containers
 */
export class DockerManager extends EventEmitter {
    private config: DockerManagerConfig;
    private instances: Map<string, SandboxInstance> = new Map();
    private allocatedPorts: Set<number> = new Set();
    private runtimeInfo: RuntimeInfo | null = null;
    private containerCommand: string | null = null;
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private nextInstanceId = 1;

    constructor(config: Partial<DockerManagerConfig> = {}) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Initialize the Docker Manager
     * Detects container runtime and prepares for sandbox creation
     */
    async initialize(): Promise<boolean> {
        console.log('[DockerManager] Initializing...');

        const preferredRuntime = this.config.preferredRuntime === 'auto'
            ? undefined
            : this.config.preferredRuntime;

        this.runtimeInfo = await detectContainerRuntime(preferredRuntime);

        if (this.runtimeInfo.available && this.runtimeInfo.type) {
            this.containerCommand = this.runtimeInfo.type;
            this.emit('runtime-detected', this.runtimeInfo);
            console.log(`[DockerManager] Using ${this.runtimeInfo.type} ${this.runtimeInfo.version}`);

            // Start health check interval
            this.startHealthChecks();

            return true;
        } else {
            this.emit('runtime-unavailable', this.runtimeInfo.reason || 'Unknown error');
            console.log('[DockerManager] No container runtime available:', this.runtimeInfo.reason);
            return false;
        }
    }

    /**
     * Check if Docker/Podman is available
     */
    async isAvailable(): Promise<boolean> {
        if (this.runtimeInfo === null) {
            await this.initialize();
        }
        return this.runtimeInfo?.available ?? false;
    }

    /**
     * Get information about the detected runtime
     */
    getRuntimeInfo(): RuntimeInfo | null {
        return this.runtimeInfo;
    }

    /**
     * Get the container command (docker or podman)
     */
    getContainerCommand(): string | null {
        return this.containerCommand;
    }

    /**
     * Clean up any orphaned GnuNae containers from previous sessions
     * Should be called on app startup
     */
    async cleanupOrphanedContainers(): Promise<number> {
        if (!this.containerCommand) {
            return 0;
        }

        try {
            // Find all containers with gnunae- prefix (running or stopped)
            const { stdout } = await execFileAsync(this.containerCommand, [
                'ps', '-a', '-q', '--filter', 'name=gnunae-'
            ]);

            const containerIds = stdout.trim().split('\n').filter(Boolean);
            if (containerIds.length === 0) {
                console.log('[DockerManager] No orphaned containers found');
                return 0;
            }

            console.log(`[DockerManager] Found ${containerIds.length} orphaned container(s), cleaning up...`);

            // Force remove all found containers
            await execFileAsync(this.containerCommand, ['rm', '-f', ...containerIds]);

            console.log(`[DockerManager] Cleaned up ${containerIds.length} orphaned container(s)`);
            return containerIds.length;
        } catch (err) {
            console.error('[DockerManager] Error cleaning up orphaned containers:', err);
            return 0;
        }
    }

    /**
     * Find an available port within the configured range
     */
    private async findAvailablePort(): Promise<number> {
        for (let port = this.config.portRangeStart; port <= this.config.portRangeEnd; port++) {
            if (this.allocatedPorts.has(port)) continue;

            const available = await this.isPortAvailable(port);
            if (available) {
                return port;
            }
        }
        throw new Error('No available ports in configured range');
    }

    /**
     * Check if a port is available for use
     */
    private isPortAvailable(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = net.createServer();
            server.once('error', () => resolve(false));
            server.once('listening', () => {
                server.close(() => resolve(true));
            });
            server.listen(port, '127.0.0.1');
        });
    }

    /**
     * Allocate ports for a new sandbox instance
     */
    private async allocatePorts(enableVnc: boolean): Promise<{
        cdpPort: number;
        apiPort: number;
        vncPort?: number;
        noVncPort?: number;
    }> {
        const cdpPort = await this.findAvailablePort();
        this.allocatedPorts.add(cdpPort);

        const apiPort = await this.findAvailablePort();
        this.allocatedPorts.add(apiPort);

        let vncPort: number | undefined;
        let noVncPort: number | undefined;

        if (enableVnc) {
            vncPort = await this.findAvailablePort();
            this.allocatedPorts.add(vncPort);

            noVncPort = await this.findAvailablePort();
            this.allocatedPorts.add(noVncPort);
        }

        return { cdpPort, apiPort, vncPort, noVncPort };
    }

    /**
     * Release ports when an instance is destroyed
     */
    private releasePorts(instance: SandboxInstance): void {
        this.allocatedPorts.delete(instance.cdpPort);
        this.allocatedPorts.delete(instance.apiPort);
        if (instance.vncPort) this.allocatedPorts.delete(instance.vncPort);
        if (instance.noVncPort) this.allocatedPorts.delete(instance.noVncPort);
    }

    /**
     * Create a new sandbox instance
     */
    async createInstance(config: SandboxConfig = {}): Promise<SandboxInstance> {
        if (!this.containerCommand) {
            throw new Error('Docker Manager not initialized. Call initialize() first.');
        }

        if (this.instances.size >= this.config.maxInstances) {
            throw new Error(`Maximum number of instances (${this.config.maxInstances}) reached`);
        }

        const instanceId = `sandbox-${this.nextInstanceId++}`;
        const containerName = config.name || `gnunae-${instanceId}-${Date.now()}`;
        const enableVnc = config.enableVnc ?? this.config.enableVnc;
        const browserMode = config.browserMode ?? 'headless';

        // Validate browser mode configuration
        if ((browserMode === 'electron-cdp' || browserMode === 'external-cdp') && !config.externalCdpEndpoint) {
            throw new Error(`externalCdpEndpoint is required for browserMode '${browserMode}'`);
        }

        // Clean up any existing container with the same name (from previous crash, etc.)
        try {
            await execFileAsync(this.containerCommand, ['rm', '-f', containerName]);
            console.log(`[DockerManager] Cleaned up existing container: ${containerName}`);
        } catch {
            // No existing container, that's fine
        }

        // Allocate ports
        const ports = await this.allocatePorts(enableVnc);

        // Create instance record
        const instance: SandboxInstance = {
            id: instanceId,
            containerId: '', // Will be set after container starts
            containerName,
            cdpPort: ports.cdpPort,
            apiPort: ports.apiPort,
            vncPort: ports.vncPort,
            noVncPort: ports.noVncPort,
            status: 'creating',
            createdAt: new Date(),
            browserMode,
            externalCdpEndpoint: config.externalCdpEndpoint,
        };

        this.instances.set(instanceId, instance);
        this.emit('instance-created', instance);

        try {
            // Build docker run command
            const args = this.buildRunArgs(instance, config);

            console.log(`[DockerManager] Creating container: ${this.containerCommand} ${args.join(' ')}`);

            instance.status = 'starting';

            // Run the container
            const { stdout } = await execFileAsync(this.containerCommand, args, {
                timeout: 60000, // 60 second timeout for container start
            });

            instance.containerId = stdout.trim();
            console.log(`[DockerManager] Container started: ${instance.containerId.substring(0, 12)}`);

            // Immediately verify container is still running (catches early crashes)
            // Wait a moment for container to fully initialize or crash
            await new Promise(resolve => setTimeout(resolve, 2000));

            try {
                const { stdout: inspectOut } = await execFileAsync(
                    this.containerCommand,
                    ['inspect', '--format', '{{.State.Running}}', instance.containerName],
                    { timeout: 5000 }
                );
                const isRunning = inspectOut.trim() === 'true';

                if (!isRunning) {
                    // Container crashed - try to get logs before it's removed
                    console.error('[DockerManager] Container crashed immediately after start!');
                    try {
                        const { stdout: logs, stderr: logsErr } = await execFileAsync(
                            this.containerCommand,
                            ['logs', '--tail', '100', instance.containerName],
                            { timeout: 5000 }
                        );
                        console.error('[DockerManager] Container crash logs:');
                        console.error(logs || logsErr || '(no logs available)');
                    } catch {
                        console.error('[DockerManager] Could not retrieve crash logs');
                    }

                    throw new Error('Container crashed immediately after starting. Check logs above.');
                }
            } catch (inspectErr: any) {
                // Container might already be removed by --rm
                if (inspectErr.message?.includes('No such container') ||
                    inspectErr.message?.includes('No such object')) {
                    console.error('[DockerManager] Container exited and was removed before we could inspect it');
                    throw new Error('Container exited immediately. The image may have startup issues on Windows.');
                }
                throw inspectErr;
            }

            instance.status = 'running';
            this.emit('instance-started', instance);

            return instance;
        } catch (error: any) {
            instance.status = 'error';
            instance.error = error.message;
            this.emit('instance-error', instance, error);

            // Clean up on error
            this.releasePorts(instance);
            this.instances.delete(instanceId);

            throw error;
        }
    }

    /**
     * Convert Windows paths to Docker mount format
     * On Windows, converts C:\Users\... to /c/Users/... for Docker volume mounts
     */
    private toDockerMountPath(hostPath: string): string {
        if (process.platform !== 'win32') return hostPath;
        // Convert C:\Users\... to /c/Users/... for Docker on Windows
        return hostPath
            .replace(/^([A-Z]):\\/i, (_, drive: string) => `/${drive.toLowerCase()}/`)
            .replace(/\\/g, '/');
    }

    /**
     * Build the docker/podman run command arguments
     */
    private buildRunArgs(instance: SandboxInstance, config: SandboxConfig): string[] {
        const memoryLimit = config.memoryLimit || this.config.defaultMemoryLimit;
        const cpuLimit = config.cpuLimit || this.config.defaultCpuLimit;
        const browserMode = instance.browserMode;

        const args = [
            'run',
            '-d', // Detached mode
            '--rm', // Auto-remove container when stopped
            '--stop-timeout', '3', // Fast shutdown (3 seconds)
            '--name', instance.containerName,
            '--memory', memoryLimit,
            '--cpus', cpuLimit,
        ];

        // For electron-cdp and external-cdp modes, we need host network access
        // to connect to the host's CDP endpoint
        if (browserMode === 'electron-cdp' || browserMode === 'external-cdp') {
            // Use host.docker.internal for Docker Desktop on macOS/Windows
            // For Linux, we need --add-host
            if (process.platform === 'linux') {
                args.push('--add-host', 'host.docker.internal:host-gateway');
            }
        }

        // Port mappings - always expose API port
        args.push('-p', `127.0.0.1:${instance.apiPort}:3000`);

        // CDP port mapping only for headless mode (container's browser)
        if (browserMode === 'headless') {
            args.push('-p', `127.0.0.1:${instance.cdpPort}:9222`);
        }

        // Add VNC ports if enabled (primarily for headless mode)
        if (instance.vncPort && instance.noVncPort) {
            args.push('-p', `127.0.0.1:${instance.vncPort}:5900`);
            args.push('-p', `127.0.0.1:${instance.noVncPort}:6080`);
            args.push('-e', 'VNC_ENABLED=true');
        }

        // Environment variables for browser mode
        args.push('-e', `BROWSER_MODE=${browserMode}`);
        args.push('-e', `API_PORT=3000`);

        if (browserMode === 'headless') {
            // Container runs its own browser
            args.push('-e', `CDP_PORT=9222`);
            args.push('-e', `START_BROWSER=true`);
        } else {
            // Connect to external CDP endpoint
            args.push('-e', `EXTERNAL_CDP_ENDPOINT=${instance.externalCdpEndpoint}`);
            args.push('-e', `START_BROWSER=false`);
        }

        // ======= Auth Token Passthrough =======
        // Mount ONLY auth.json, not the entire ~/.codex directory
        // This keeps the container isolated from host's Codex configurations
        const mountAuth = config.mountCodexAuth !== false; // Default: true
        if (mountAuth) {
            const os = require('os');
            const path = require('path');
            const fs = require('fs');
            const codexAuthDir = config.codexAuthPath || path.join(os.homedir(), '.codex');
            const authJsonPath = path.join(codexAuthDir, 'auth.json');

            // Only mount if auth.json exists
            if (fs.existsSync(authJsonPath)) {
                // Mount auth.json as a single file (read-only)
                // Convert Windows paths (C:\...) to Docker format (/c/...)
                const dockerPath = this.toDockerMountPath(authJsonPath);
                args.push('-v', `${dockerPath}:/home/sandbox/.codex/auth.json:ro`);
                console.log(`[DockerManager] Mounting auth token from: ${authJsonPath} -> ${dockerPath}`);
            } else {
                console.log(`[DockerManager] No auth.json found at ${authJsonPath}, skipping auth mount`);
            }
        }

        // User-provided environment variables
        if (config.env) {
            for (const [key, value] of Object.entries(config.env)) {
                args.push('-e', `${key}=${value}`);
            }
        }

        // User-provided volume mounts
        if (config.volumes) {
            for (const volume of config.volumes) {
                args.push('-v', volume);
            }
        }

        // Security settings
        args.push('--security-opt', 'seccomp=unconfined'); // Required for Playwright

        // Add the image name
        args.push(this.config.imageName);

        return args;
    }

    /**
     * Stop and remove a sandbox instance
     */
    async destroyInstance(instanceId: string): Promise<void> {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            throw new Error(`Instance ${instanceId} not found`);
        }

        if (!this.containerCommand) {
            throw new Error('Docker Manager not initialized');
        }

        console.log(`[DockerManager] Destroying instance: ${instanceId}`);
        instance.status = 'stopping';

        try {
            // Stop the container
            await execFileAsync(this.containerCommand, ['stop', '-t', '5', instance.containerName], {
                timeout: 15000,
            }).catch(() => { }); // Ignore errors if container already stopped

            // Remove the container
            await execFileAsync(this.containerCommand, ['rm', '-f', instance.containerName], {
                timeout: 10000,
            }).catch(() => { }); // Ignore errors if container already removed

            instance.status = 'stopped';
            this.emit('instance-stopped', instance);
        } finally {
            // Clean up regardless of success/failure
            this.releasePorts(instance);
            this.instances.delete(instanceId);
        }
    }

    /**
     * Get a specific instance by ID
     */
    getInstance(instanceId: string): SandboxInstance | undefined {
        return this.instances.get(instanceId);
    }

    /**
     * List all active instances
     */
    listInstances(): SandboxInstance[] {
        return Array.from(this.instances.values());
    }

    /**
     * Get the number of running instances
     */
    getInstanceCount(): number {
        return this.instances.size;
    }

    /**
     * Check health of all instances
     */
    private async checkInstanceHealth(instance: SandboxInstance): Promise<boolean> {
        if (!this.containerCommand || instance.status !== 'running') {
            return false;
        }

        try {
            const { stdout } = await execFileAsync(
                this.containerCommand,
                ['inspect', '--format', '{{.State.Running}}', instance.containerName],
                { timeout: 5000 }
            );

            const isRunning = stdout.trim() === 'true';

            instance.health = {
                lastCheck: new Date(),
                healthy: isRunning,
            };

            if (!isRunning && instance.status === 'running') {
                instance.status = 'stopped';
                this.emit('instance-stopped', instance);
            }

            return isRunning;
        } catch {
            instance.health = {
                lastCheck: new Date(),
                healthy: false,
            };
            return false;
        }
    }

    /**
     * Start periodic health checks
     */
    private startHealthChecks(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(async () => {
            for (const instance of this.instances.values()) {
                if (instance.status === 'running') {
                    await this.checkInstanceHealth(instance);
                }
            }
        }, 30000); // Check every 30 seconds
    }

    /**
     * Stop health checks
     */
    private stopHealthChecks(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    /**
     * Clean up all instances and stop the manager
     */
    async shutdown(): Promise<void> {
        console.log('[DockerManager] Shutting down...');

        this.stopHealthChecks();

        // Stop all running instances
        const destroyPromises = Array.from(this.instances.keys()).map(id =>
            this.destroyInstance(id).catch(err => {
                console.error(`[DockerManager] Error destroying ${id}:`, err);
            })
        );

        await Promise.all(destroyPromises);

        console.log('[DockerManager] Shutdown complete');
    }

    /**
     * Check if the sandbox image exists locally
     */
    async isImageAvailable(): Promise<boolean> {
        if (!this.containerCommand) return false;

        try {
            await execFileAsync(
                this.containerCommand,
                ['image', 'inspect', this.config.imageName],
                { timeout: 10000 }
            );
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Pull the sandbox image
     */
    async pullImage(): Promise<void> {
        if (!this.containerCommand) {
            throw new Error('Docker Manager not initialized');
        }

        console.log(`[DockerManager] Pulling image: ${this.config.imageName}`);

        await execFileAsync(
            this.containerCommand,
            ['pull', this.config.imageName],
            { timeout: 300000 } // 5 minute timeout for pull
        );

        console.log(`[DockerManager] Image pulled successfully`);
    }

    /**
     * Build the sandbox image from local Dockerfile
     */
    async buildImage(dockerfilePath: string): Promise<void> {
        if (!this.containerCommand) {
            throw new Error('Docker Manager not initialized');
        }

        console.log(`[DockerManager] Building image: ${this.config.imageName}`);

        await execFileAsync(
            this.containerCommand,
            ['build', '-t', this.config.imageName, '-f', dockerfilePath, '.'],
            { timeout: 600000 } // 10 minute timeout for build
        );

        console.log(`[DockerManager] Image built successfully`);
    }
}

// Singleton instance for global access
let dockerManagerInstance: DockerManager | null = null;

/**
 * Get the global Docker Manager instance
 */
export function getDockerManager(): DockerManager {
    if (!dockerManagerInstance) {
        dockerManagerInstance = new DockerManager();
    }
    return dockerManagerInstance;
}

/**
 * Initialize the global Docker Manager
 */
export async function initializeDockerManager(
    config?: Partial<DockerManagerConfig>
): Promise<DockerManager> {
    dockerManagerInstance = new DockerManager(config);
    await dockerManagerInstance.initialize();
    return dockerManagerInstance;
}
