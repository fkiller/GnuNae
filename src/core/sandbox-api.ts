/**
 * Sandbox API Client
 * 
 * Client for communicating with the API server running inside sandbox containers.
 * Provides methods for:
 * - Executing Codex prompts
 * - Controlling Playwright MCP
 * - Health checks and status monitoring
 */

import * as http from 'http';
import { EventEmitter } from 'events';

/**
 * Configuration for connecting to a sandbox
 */
export interface SandboxConnectionConfig {
    /** Host address (default: 127.0.0.1) */
    host?: string;
    /** API port */
    apiPort: number;
    /** CDP port for Playwright */
    cdpPort: number;
    /** Connection timeout in ms */
    timeout?: number;
}

/**
 * Codex execution options
 */
export interface CodexExecuteOptions {
    /** Execution mode: 'ask', 'agent', 'full-access' */
    mode?: string;
    /** Model to use */
    model?: string;
    /** Working directory inside container */
    workDir?: string;
    /** Pre-prompt to prepend */
    prePrompt?: string;
    /** Environment variables */
    env?: Record<string, string>;
}

/**
 * Sandbox status response
 */
export interface SandboxStatus {
    uptime: number;
    requestCount: number;
    codexRunning: boolean;
    playwrightMcpRunning: boolean;
    cdpPort: number;
    apiPort: number;
    vncEnabled: boolean;
}

/**
 * Health check response
 */
export interface HealthCheckResponse {
    status: 'healthy' | 'unhealthy';
    uptime: number;
    requestCount: number;
    codexRunning: boolean;
    playwrightMcpRunning: boolean;
    cdpPort: number;
}

/**
 * Events emitted during Codex execution
 */
export interface CodexExecutionEvents {
    'stdout': (data: string) => void;
    'stderr': (data: string) => void;
    'exit': (code: number | null) => void;
    'error': (error: Error) => void;
}

/**
 * Sandbox API Client class
 */
export class SandboxApiClient extends EventEmitter {
    private host: string;
    private apiPort: number;
    private cdpPort: number;
    private timeout: number;
    private currentRequest: http.ClientRequest | null = null;

    constructor(config: SandboxConnectionConfig) {
        super();
        this.host = config.host || '127.0.0.1';
        this.apiPort = config.apiPort;
        this.cdpPort = config.cdpPort;
        this.timeout = config.timeout || 30000;
    }

    /**
     * Make an HTTP request to the sandbox API
     */
    private async request<T>(
        method: string,
        path: string,
        body?: any
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const options: http.RequestOptions = {
                hostname: this.host,
                port: this.apiPort,
                path,
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: this.timeout,
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (res.statusCode && res.statusCode >= 400) {
                            reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
                        } else {
                            resolve(parsed);
                        }
                    } catch (err) {
                        reject(new Error(`Failed to parse response: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (body) {
                req.write(JSON.stringify(body));
            }
            req.end();
        });
    }

    /**
     * Check if the sandbox is healthy
     */
    async healthCheck(): Promise<HealthCheckResponse> {
        return this.request<HealthCheckResponse>('GET', '/health');
    }

    /**
     * Get sandbox status
     */
    async getStatus(): Promise<SandboxStatus> {
        return this.request<SandboxStatus>('GET', '/status');
    }

    /**
     * Wait for the sandbox to become healthy
     */
    async waitForHealthy(maxAttempts: number = 30, intervalMs: number = 1000): Promise<boolean> {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const health = await this.healthCheck();
                if (health.status === 'healthy') {
                    return true;
                }
            } catch {
                // Not ready yet, continue waiting
            }
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
        return false;
    }

    /**
     * Send heartbeat to keep container alive
     * Container will self-terminate if no heartbeat received within timeout
     */
    async sendHeartbeat(): Promise<{ success: boolean; timeout: number }> {
        return this.request<{ success: boolean; timeout: number }>('POST', '/heartbeat');
    }

    /**
     * Execute a Codex prompt with streaming output
     * 
     * @returns A function to abort the execution
     */
    executeCodex(
        prompt: string,
        options: CodexExecuteOptions = {},
        onStdout: (data: string) => void,
        onStderr: (data: string) => void,
        onExit: (code: number | null) => void
    ): () => void {
        const body = JSON.stringify({
            prompt,
            mode: options.mode,
            model: options.model,
            workDir: options.workDir,
            prePrompt: options.prePrompt,
            env: options.env,
        });

        const requestOptions: http.RequestOptions = {
            hostname: this.host,
            port: this.apiPort,
            path: '/codex/execute',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const req = http.request(requestOptions, (res) => {
            let buffer = '';

            res.on('data', (chunk) => {
                buffer += chunk.toString();

                // Process Server-Sent Events
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const event = JSON.parse(line.substring(6));
                            switch (event.type) {
                                case 'stdout':
                                    onStdout(event.data);
                                    break;
                                case 'stderr':
                                    onStderr(event.data);
                                    break;
                                case 'exit':
                                    onExit(event.code);
                                    break;
                            }
                        } catch (err) {
                            console.error('[SandboxAPI] Failed to parse event:', line);
                        }
                    }
                }
            });

            res.on('end', () => {
                // Process any remaining data in buffer
                if (buffer.startsWith('data: ')) {
                    try {
                        const event = JSON.parse(buffer.substring(6));
                        if (event.type === 'exit') {
                            onExit(event.code);
                        }
                    } catch {
                        // Ignore
                    }
                }
            });

            res.on('error', (err) => {
                onStderr(`Connection error: ${err.message}`);
                onExit(1);
            });
        });

        req.on('error', (err) => {
            onStderr(`Request error: ${err.message}`);
            onExit(1);
        });

        req.write(body);
        req.end();

        this.currentRequest = req;

        // Return abort function
        return () => {
            req.destroy();
            this.stopCodex().catch(() => { });
        };
    }

    /**
     * Stop the current Codex execution
     */
    async stopCodex(): Promise<{ success: boolean; message: string }> {
        if (this.currentRequest) {
            this.currentRequest.destroy();
            this.currentRequest = null;
        }
        return this.request<{ success: boolean; message: string }>('POST', '/codex/stop');
    }

    /**
     * Start Playwright MCP inside the container
     */
    async startPlaywrightMcp(): Promise<{ success: boolean; message: string }> {
        return this.request<{ success: boolean; message: string }>('POST', '/playwright/start');
    }

    /**
     * Stop Playwright MCP inside the container
     */
    async stopPlaywrightMcp(): Promise<{ success: boolean; message: string }> {
        return this.request<{ success: boolean; message: string }>('POST', '/playwright/stop');
    }

    /**
     * Get CDP connection info
     */
    async getCdpInfo(): Promise<{ endpoint: string; port: number }> {
        return this.request<{ endpoint: string; port: number }>('GET', '/cdp/info');
    }

    /**
     * Get the CDP WebSocket endpoint URL
     */
    getCdpEndpoint(): string {
        return `http://${this.host}:${this.cdpPort}`;
    }

    /**
     * Get the API base URL
     */
    getApiUrl(): string {
        return `http://${this.host}:${this.apiPort}`;
    }
}

/**
 * Create a client for a sandbox instance
 */
export function createSandboxClient(config: SandboxConnectionConfig): SandboxApiClient {
    return new SandboxApiClient(config);
}
