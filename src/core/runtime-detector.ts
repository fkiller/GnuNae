/**
 * Runtime Detector - Detects available container runtimes (Docker/Podman)
 * 
 * This module handles cross-platform detection of container runtime availability,
 * checking for Docker or Podman and verifying VM support on non-Linux platforms.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execFileAsync = promisify(execFile);

/**
 * Supported container runtime types
 */
export type ContainerRuntimeType = 'docker' | 'podman';

/**
 * Information about the detected container runtime
 */
export interface RuntimeInfo {
    /** Whether a usable container runtime is available */
    available: boolean;
    /** The type of runtime detected */
    type: ContainerRuntimeType | null;
    /** Version string of the runtime */
    version?: string;
    /** Whether the runtime can run Linux containers (VM support on macOS/Windows) */
    vmSupport: boolean;
    /** Human-readable reason if runtime is unavailable */
    reason?: string;
    /** Additional details about the runtime environment */
    details?: {
        /** Docker/Podman server version */
        serverVersion?: string;
        /** Operating system of the container host */
        containerOS?: string;
        /** Architecture of the container host */
        containerArch?: string;
    };
}

/**
 * Result of a command execution
 */
interface CommandResult {
    success: boolean;
    stdout: string;
    stderr: string;
}

/**
 * Execute a command and return the result
 */
async function runCommand(command: string, args: string[]): Promise<CommandResult> {
    try {
        const { stdout, stderr } = await execFileAsync(command, args, {
            timeout: 10000, // 10 second timeout
            windowsHide: true,
        });
        return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (error: any) {
        return {
            success: false,
            stdout: error.stdout?.trim() || '',
            stderr: error.stderr?.trim() || error.message || 'Command failed',
        };
    }
}

/**
 * Parse version from docker/podman --version output
 * Example outputs:
 *   Docker version 24.0.7, build afdd53b
 *   podman version 4.7.2
 */
function parseVersion(versionOutput: string): string | undefined {
    const match = versionOutput.match(/version\s+([\d.]+)/i);
    return match?.[1];
}

/**
 * Check Docker availability and get version info
 */
async function checkDocker(): Promise<RuntimeInfo> {
    // First check if docker CLI is available
    const versionResult = await runCommand('docker', ['--version']);
    if (!versionResult.success) {
        return {
            available: false,
            type: null,
            vmSupport: false,
            reason: 'Docker CLI not found. Install Docker Desktop or Docker Engine.',
        };
    }

    const version = parseVersion(versionResult.stdout);

    // Check if Docker daemon is running and accessible
    const infoResult = await runCommand('docker', ['info', '--format', '{{json .}}']);
    if (!infoResult.success) {
        // Docker CLI exists but daemon isn't accessible
        let reason = 'Docker daemon is not running.';

        if (infoResult.stderr.includes('permission denied')) {
            reason = 'Permission denied accessing Docker. You may need to add your user to the docker group.';
        } else if (infoResult.stderr.includes('Cannot connect')) {
            reason = 'Cannot connect to Docker daemon. Is Docker Desktop or Docker Engine running?';
        }

        return {
            available: false,
            type: 'docker',
            version,
            vmSupport: false,
            reason,
        };
    }

    // Parse Docker info for additional details
    let details: RuntimeInfo['details'] = {};
    try {
        const info = JSON.parse(infoResult.stdout);
        details = {
            serverVersion: info.ServerVersion,
            containerOS: info.OSType,
            containerArch: info.Architecture,
        };
    } catch {
        // JSON parsing failed, continue without details
    }

    // Check if we can run Linux containers
    // On Linux, this is always true. On macOS/Windows, Docker Desktop provides a VM.
    const platform = os.platform();
    let vmSupport = true;

    if (platform === 'darwin' || platform === 'win32') {
        // On non-Linux, verify Docker is configured for Linux containers
        // Docker Desktop handles this automatically, but we should verify
        if (details.containerOS && details.containerOS !== 'linux') {
            return {
                available: false,
                type: 'docker',
                version,
                vmSupport: false,
                reason: `Docker is configured for ${details.containerOS} containers. Linux containers are required.`,
                details,
            };
        }
    }

    return {
        available: true,
        type: 'docker',
        version,
        vmSupport,
        details,
    };
}

/**
 * Check Podman availability and get version info
 */
async function checkPodman(): Promise<RuntimeInfo> {
    // First check if podman CLI is available
    const versionResult = await runCommand('podman', ['--version']);
    if (!versionResult.success) {
        return {
            available: false,
            type: null,
            vmSupport: false,
            reason: 'Podman CLI not found. Install Podman or Podman Desktop.',
        };
    }

    const version = parseVersion(versionResult.stdout);

    // Check if Podman machine is running (required on macOS/Windows)
    const platform = os.platform();

    if (platform === 'darwin' || platform === 'win32') {
        // On non-Linux, we need a Podman machine
        const machineResult = await runCommand('podman', ['machine', 'list', '--format', 'json']);
        if (!machineResult.success) {
            return {
                available: false,
                type: 'podman',
                version,
                vmSupport: false,
                reason: 'Cannot list Podman machines. Podman may not be properly installed.',
            };
        }

        try {
            const machines = JSON.parse(machineResult.stdout || '[]');
            const runningMachine = machines.find((m: any) => m.Running || m.LastUp === 'Currently running');

            if (!runningMachine && machines.length === 0) {
                return {
                    available: false,
                    type: 'podman',
                    version,
                    vmSupport: false,
                    reason: 'No Podman machine found. Run `podman machine init` and `podman machine start`.',
                };
            }

            if (!runningMachine) {
                return {
                    available: false,
                    type: 'podman',
                    version,
                    vmSupport: false,
                    reason: 'Podman machine is not running. Run `podman machine start`.',
                };
            }
        } catch {
            // JSON parsing failed, try to verify with a simple command
        }
    }

    // Verify Podman can run containers
    const infoResult = await runCommand('podman', ['info', '--format', '{{json .}}']);
    if (!infoResult.success) {
        return {
            available: false,
            type: 'podman',
            version,
            vmSupport: false,
            reason: 'Cannot get Podman info. The Podman service may not be running.',
        };
    }

    // Parse Podman info for additional details
    let details: RuntimeInfo['details'] = {};
    try {
        const info = JSON.parse(infoResult.stdout);
        details = {
            serverVersion: info.version?.Version,
            containerOS: info.host?.os,
            containerArch: info.host?.arch,
        };
    } catch {
        // JSON parsing failed, continue without details
    }

    return {
        available: true,
        type: 'podman',
        version,
        vmSupport: true,
        details,
    };
}

/**
 * Detect available container runtime
 * 
 * Checks for Docker first, then Podman. Returns info about the first
 * working runtime found, or details about why none are available.
 * 
 * @param preferredRuntime - Optionally prefer a specific runtime
 * @returns RuntimeInfo with availability status and details
 */
export async function detectContainerRuntime(
    preferredRuntime?: ContainerRuntimeType
): Promise<RuntimeInfo> {
    const checks = preferredRuntime === 'podman'
        ? [checkPodman, checkDocker]
        : [checkDocker, checkPodman];

    for (const check of checks) {
        const result = await check();
        if (result.available) {
            console.log(`[RuntimeDetector] Found ${result.type} ${result.version}`);
            return result;
        }
    }

    // Neither runtime is available
    const dockerResult = await checkDocker();
    const podmanResult = await checkPodman();

    // Provide helpful error message
    const platform = os.platform();
    let suggestion = '';

    if (platform === 'darwin') {
        suggestion = 'Install Docker Desktop (https://docker.com/products/docker-desktop) or Podman Desktop (https://podman-desktop.io).';
    } else if (platform === 'win32') {
        suggestion = 'Install Docker Desktop with WSL2 backend or Podman Desktop.';
    } else {
        suggestion = 'Install Docker Engine or Podman.';
    }

    return {
        available: false,
        type: null,
        vmSupport: false,
        reason: `No container runtime available. Docker: ${dockerResult.reason} Podman: ${podmanResult.reason} ${suggestion}`,
    };
}

/**
 * Quick check if any container runtime is available
 * Faster than full detection - just checks if commands exist
 */
export async function isContainerRuntimeAvailable(): Promise<boolean> {
    const dockerCheck = await runCommand('docker', ['--version']);
    if (dockerCheck.success) {
        const infoCheck = await runCommand('docker', ['info']);
        if (infoCheck.success) return true;
    }

    const podmanCheck = await runCommand('podman', ['--version']);
    if (podmanCheck.success) {
        const infoCheck = await runCommand('podman', ['info']);
        if (infoCheck.success) return true;
    }

    return false;
}

/**
 * Get the command to use for running containers
 * Returns 'docker' or 'podman' based on what's available
 */
export async function getContainerCommand(): Promise<string | null> {
    const runtime = await detectContainerRuntime();
    return runtime.available ? runtime.type : null;
}
