/**
 * Shortcut Manager - Creates browser shortcuts with GnuNae integration
 * 
 * Creates platform-specific shortcuts that launch GnuNae in hidden mode
 * and trigger the designated browser with CDP enabled.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { app } from 'electron';

export type ShortcutLocation = 'desktop' | 'startMenu' | 'applications';

export interface ShortcutOptions {
    browserId: string;
    browserName: string;
    locations: ShortcutLocation[];
    gnuNaeExecutable?: string;  // Auto-detected if not provided
    iconPath?: string;          // Path to shortcut icon
}

export interface ShortcutResult {
    success: boolean;
    location: ShortcutLocation;
    path?: string;
    error?: string;
}

export class ShortcutManager {
    private platform: NodeJS.Platform;

    constructor() {
        this.platform = process.platform;
    }

    /**
     * Create shortcuts for a browser
     */
    async createShortcuts(options: ShortcutOptions): Promise<ShortcutResult[]> {
        const results: ShortcutResult[] = [];

        for (const location of options.locations) {
            try {
                const result = await this.createShortcut(options, location);
                results.push(result);
            } catch (error: any) {
                results.push({
                    success: false,
                    location,
                    error: error.message || 'Unknown error',
                });
            }
        }

        return results;
    }

    /**
     * Create a single shortcut
     */
    private async createShortcut(
        options: ShortcutOptions,
        location: ShortcutLocation
    ): Promise<ShortcutResult> {
        switch (this.platform) {
            case 'win32':
                return this.createWindowsShortcut(options, location);
            case 'darwin':
                return this.createMacOSShortcut(options, location);
            case 'linux':
                return this.createLinuxShortcut(options, location);
            default:
                return {
                    success: false,
                    location,
                    error: `Unsupported platform: ${this.platform}`,
                };
        }
    }

    /**
     * Create Windows shortcut (.lnk file)
     */
    private async createWindowsShortcut(
        options: ShortcutOptions,
        location: ShortcutLocation
    ): Promise<ShortcutResult> {
        const shortcutDir = this.getWindowsShortcutDirectory(location);
        if (!shortcutDir) {
            return {
                success: false,
                location,
                error: `Cannot determine ${location} directory`,
            };
        }

        // Ensure directory exists
        if (!fs.existsSync(shortcutDir)) {
            fs.mkdirSync(shortcutDir, { recursive: true });
        }

        const shortcutName = `GnuNae + ${options.browserName}.lnk`;
        const shortcutPath = path.join(shortcutDir, shortcutName);
        const gnuNaeExe = options.gnuNaeExecutable || this.getGnuNaeExecutable();

        // In dev mode, we need to pass the app directory as the first argument
        // In packaged mode, just pass the flags. Always include --chat-mode for external browser shortcuts.
        let args: string;
        if (app.isPackaged) {
            args = `--chat-mode --external-browser=${options.browserId}`;
        } else {
            // Dev mode: electron.exe needs the app path as first arg
            const appPath = path.resolve(__dirname, '../..');  // Points to project root
            args = `"${appPath}" --chat-mode --external-browser=${options.browserId}`;
        }

        // Get icon - use provided, or find GnuNae icon, or fall back to exe
        let iconLocation = options.iconPath || this.getGnuNaeIcon();
        // If icon doesn't exist, try the executable (works for packaged app)
        if (!fs.existsSync(iconLocation)) {
            iconLocation = gnuNaeExe;
        }
        // If exe doesn't exist either (dev mode), use a Windows system icon
        if (!fs.existsSync(iconLocation)) {
            iconLocation = '%SystemRoot%\\\\System32\\\\shell32.dll,14'; // Default browser icon
        }

        // Write PowerShell script to temp file to avoid quote escaping issues
        const tempScriptPath = path.join(os.tmpdir(), `gnunae-shortcut-${Date.now()}.ps1`);

        // Escape double quotes for PowerShell (use backtick-quote)
        const psArgs = args.replace(/"/g, '`"');

        const psScript = `
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("${shortcutPath}")
$Shortcut.TargetPath = "${gnuNaeExe}"
$Shortcut.Arguments = "${psArgs}"
$Shortcut.WorkingDirectory = "${path.dirname(gnuNaeExe)}"
$Shortcut.IconLocation = "${iconLocation}"
$Shortcut.Description = "Launch ${options.browserName} with GnuNae AI Integration"
$Shortcut.Save()
`;

        try {
            // Write script to temp file
            fs.writeFileSync(tempScriptPath, psScript, 'utf8');

            // Execute the script
            execSync(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tempScriptPath}"`, {
                windowsHide: true,
                encoding: 'utf8',
            });

            // Clean up temp script
            try { fs.unlinkSync(tempScriptPath); } catch { }

            // Verify the shortcut was actually created
            if (fs.existsSync(shortcutPath)) {
                console.log(`[ShortcutManager] Created Windows shortcut: ${shortcutPath}`);
                return {
                    success: true,
                    location,
                    path: shortcutPath,
                };
            } else {
                console.error('[ShortcutManager] Shortcut file was not created at:', shortcutPath);
                return {
                    success: false,
                    location,
                    error: 'Shortcut file was not created - check path permissions',
                };
            }
        } catch (error: any) {
            // Clean up temp script on error
            try { fs.unlinkSync(tempScriptPath); } catch { }

            console.error('[ShortcutManager] Failed to create Windows shortcut:', error.message);
            console.error('[ShortcutManager] Script path:', tempScriptPath);
            console.error('[ShortcutManager] Target path:', shortcutPath);
            return {
                success: false,
                location,
                error: error.message,
            };
        }
    }

    /**
     * Create macOS shortcut (.app bundle)
     */
    private async createMacOSShortcut(
        options: ShortcutOptions,
        location: ShortcutLocation
    ): Promise<ShortcutResult> {
        const shortcutDir = this.getMacOSShortcutDirectory(location);
        if (!shortcutDir) {
            return {
                success: false,
                location,
                error: `Cannot determine ${location} directory`,
            };
        }

        // Ensure directory exists
        if (!fs.existsSync(shortcutDir)) {
            fs.mkdirSync(shortcutDir, { recursive: true });
        }

        const appName = `GnuNae + ${options.browserName}.app`;
        const appPath = path.join(shortcutDir, appName);
        const gnuNaeExe = options.gnuNaeExecutable || this.getGnuNaeExecutable();
        const args = `--chat-mode --external-browser=${options.browserId}`;

        try {
            // Create .app bundle structure
            const contentsDir = path.join(appPath, 'Contents');
            const macOSDir = path.join(contentsDir, 'MacOS');
            const resourcesDir = path.join(contentsDir, 'Resources');

            if (fs.existsSync(appPath)) {
                fs.rmSync(appPath, { recursive: true });
            }

            fs.mkdirSync(macOSDir, { recursive: true });
            fs.mkdirSync(resourcesDir, { recursive: true });

            // Create Info.plist with icon reference
            const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>launcher</string>
    <key>CFBundleIdentifier</key>
    <string>com.gnunae.browser.${options.browserId}</string>
    <key>CFBundleName</key>
    <string>GnuNae + ${options.browserName}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
</dict>
</plist>`;
            fs.writeFileSync(path.join(contentsDir, 'Info.plist'), plistContent);

            // Copy icon to Resources folder
            const iconSource = options.iconPath || this.getGnuNaeIcon();
            if (fs.existsSync(iconSource)) {
                const iconDest = path.join(resourcesDir, 'AppIcon.icns');
                // Check if there's already an .icns version
                const icnsSource = iconSource.replace('.png', '.icns');
                if (fs.existsSync(icnsSource)) {
                    fs.copyFileSync(icnsSource, iconDest);
                } else if (iconSource.endsWith('.png')) {
                    // Convert PNG to ICNS using macOS tools (sips + iconutil)
                    try {
                        const iconsetDir = path.join(resourcesDir, 'AppIcon.iconset');
                        if (!fs.existsSync(iconsetDir)) {
                            fs.mkdirSync(iconsetDir, { recursive: true });
                        }

                        // Create iconset with required sizes using sips
                        const sizes = [16, 32, 64, 128, 256, 512];
                        for (const size of sizes) {
                            const destFile = path.join(iconsetDir, `icon_${size}x${size}.png`);
                            execSync(`sips -z ${size} ${size} "${iconSource}" --out "${destFile}"`, { stdio: 'pipe' });
                            // Also create @2x version for Retina
                            if (size <= 256) {
                                const dest2x = path.join(iconsetDir, `icon_${size}x${size}@2x.png`);
                                execSync(`sips -z ${size * 2} ${size * 2} "${iconSource}" --out "${dest2x}"`, { stdio: 'pipe' });
                            }
                        }

                        // Convert iconset to icns
                        execSync(`iconutil -c icns "${iconsetDir}" -o "${iconDest}"`, { stdio: 'pipe' });

                        // Clean up iconset folder
                        fs.rmSync(iconsetDir, { recursive: true });
                        console.log(`[ShortcutManager] Converted PNG to ICNS: ${iconDest}`);
                    } catch (e: any) {
                        console.error('[ShortcutManager] Failed to convert PNG to ICNS:', e.message);
                        // Fallback: just copy the PNG (icon won't show but app will work)
                        fs.copyFileSync(iconSource, iconDest);
                    }
                } else {
                    // Copy whatever format it is
                    fs.copyFileSync(iconSource, iconDest);
                }
            }

            // Create launcher script
            // IMPORTANT: macOS .app bundles run with minimal PATH that doesn't include Homebrew, nvm, etc.
            // We need to source the user's shell profile to get the full PATH
            // Also set common paths explicitly as fallback
            const pathSetup = `
# Source user's shell profile to get full PATH (node, docker, etc.)
if [ -f "$HOME/.zshrc" ]; then
    source "$HOME/.zshrc" 2>/dev/null || true
elif [ -f "$HOME/.bashrc" ]; then
    source "$HOME/.bashrc" 2>/dev/null || true
elif [ -f "$HOME/.bash_profile" ]; then
    source "$HOME/.bash_profile" 2>/dev/null || true
fi

# Add common paths as fallback (Homebrew, nvm, etc.)
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH"
`;

            let launcherScript: string;
            if (app.isPackaged) {
                // Find the .app bundle path from the executable path
                // gnuNaeExe is like /Applications/GnuNae.app/Contents/MacOS/GnuNae
                // We need /Applications/GnuNae.app
                const appBundlePath = gnuNaeExe.replace(/\/Contents\/MacOS\/[^/]+$/, '');
                launcherScript = `#!/bin/bash
${pathSetup}
open -a "${appBundlePath}" --args ${args}
`;
            } else {
                // Dev mode: electron needs the app directory as the FIRST argument before any flags
                // This is critical - without the app path, Electron won't load the app code
                const appDir = path.resolve(__dirname, '../..');  // Points to project root (dist -> src -> root)
                launcherScript = `#!/bin/bash
${pathSetup}
"${gnuNaeExe}" "${appDir}" ${args}
`;
            }
            const launcherPath = path.join(macOSDir, 'launcher');
            fs.writeFileSync(launcherPath, launcherScript);
            fs.chmodSync(launcherPath, '755');

            console.log(`[ShortcutManager] Created macOS app bundle: ${appPath}`);
            return {
                success: true,
                location,
                path: appPath,
            };
        } catch (error: any) {
            console.error('[ShortcutManager] Failed to create macOS shortcut:', error);
            return {
                success: false,
                location,
                error: error.message,
            };
        }
    }

    /**
     * Create Linux shortcut (.desktop file)
     */
    private async createLinuxShortcut(
        options: ShortcutOptions,
        location: ShortcutLocation
    ): Promise<ShortcutResult> {
        const shortcutDir = this.getLinuxShortcutDirectory(location);
        if (!shortcutDir) {
            return {
                success: false,
                location,
                error: `Cannot determine ${location} directory`,
            };
        }

        // Ensure directory exists
        if (!fs.existsSync(shortcutDir)) {
            fs.mkdirSync(shortcutDir, { recursive: true });
        }

        const desktopFileName = `gnunae-${options.browserId}.desktop`;
        const desktopFilePath = path.join(shortcutDir, desktopFileName);
        const gnuNaeExe = options.gnuNaeExecutable || this.getGnuNaeExecutable();
        const iconPath = options.iconPath || this.getGnuNaeIcon();

        // In dev mode, we need to pass the app directory as the first argument
        // Also create a wrapper script to ensure proper PATH for nvm etc.
        let execCommand: string;
        if (app.isPackaged) {
            execCommand = `"${gnuNaeExe}" --chat-mode --external-browser=${options.browserId}`;
        } else {
            // Dev mode: electron needs the app path as first arg
            const appDir = path.resolve(__dirname, '../..');
            execCommand = `"${gnuNaeExe}" "${appDir}" --chat-mode --external-browser=${options.browserId}`;
        }

        // For .desktop files, we can use a shell wrapper to source profile
        // This ensures node, docker etc. are in PATH when launched from desktop
        const desktopContent = `[Desktop Entry]
Version=1.0
Type=Application
Name=GnuNae + ${options.browserName}
Comment=Launch ${options.browserName} with GnuNae AI Integration
Exec=/bin/bash -c 'source ~/.bashrc 2>/dev/null || source ~/.profile 2>/dev/null || true; export PATH="/usr/local/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -1)/bin:$PATH"; ${execCommand.replace(/'/g, "'\\''")}'
Icon=${iconPath}
Terminal=false
Categories=Network;WebBrowser;
`;

        try {
            fs.writeFileSync(desktopFilePath, desktopContent);
            fs.chmodSync(desktopFilePath, '755');

            // Update desktop database if creating in applications
            if (location === 'applications') {
                try {
                    execSync('update-desktop-database ~/.local/share/applications', {
                        stdio: 'ignore',
                    });
                } catch {
                    // Ignore if update-desktop-database is not available
                }
            }

            console.log(`[ShortcutManager] Created Linux desktop file: ${desktopFilePath}`);
            return {
                success: true,
                location,
                path: desktopFilePath,
            };
        } catch (error: any) {
            console.error('[ShortcutManager] Failed to create Linux shortcut:', error);
            return {
                success: false,
                location,
                error: error.message,
            };
        }
    }

    /**
     * Remove shortcuts for a browser
     */
    async removeShortcuts(browserId: string, locations: ShortcutLocation[]): Promise<ShortcutResult[]> {
        const results: ShortcutResult[] = [];

        for (const location of locations) {
            try {
                const result = await this.removeShortcut(browserId, location);
                results.push(result);
            } catch (error: any) {
                results.push({
                    success: false,
                    location,
                    error: error.message,
                });
            }
        }

        return results;
    }

    /**
     * Remove a single shortcut
     */
    private async removeShortcut(
        browserId: string,
        location: ShortcutLocation
    ): Promise<ShortcutResult> {
        let shortcutPath: string | null = null;

        switch (this.platform) {
            case 'win32': {
                const dir = this.getWindowsShortcutDirectory(location);
                if (dir) {
                    // Find the shortcut file
                    const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
                    const shortcutFile = files.find(f =>
                        f.endsWith('.lnk') && f.toLowerCase().includes(browserId.toLowerCase())
                    );
                    if (shortcutFile) {
                        shortcutPath = path.join(dir, shortcutFile);
                    }
                }
                break;
            }
            case 'darwin': {
                const dir = this.getMacOSShortcutDirectory(location);
                if (dir) {
                    const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
                    const appBundle = files.find(f =>
                        f.endsWith('.app') && f.toLowerCase().includes(browserId.toLowerCase()) && f.includes('GnuNae')
                    );
                    if (appBundle) {
                        shortcutPath = path.join(dir, appBundle);
                    }
                }
                break;
            }
            case 'linux': {
                const dir = this.getLinuxShortcutDirectory(location);
                if (dir) {
                    shortcutPath = path.join(dir, `gnunae-${browserId}.desktop`);
                }
                break;
            }
        }

        if (shortcutPath && fs.existsSync(shortcutPath)) {
            try {
                // On Windows, use PowerShell for more reliable deletion (handles OneDrive sync)
                if (this.platform === 'win32') {
                    try {
                        execSync(`powershell -NoProfile -Command "Remove-Item -Path '${shortcutPath}' -Force"`, {
                            windowsHide: true,
                            encoding: 'utf8',
                        });
                    } catch {
                        // Fallback to fs.unlinkSync
                        fs.unlinkSync(shortcutPath);
                    }
                } else if (fs.lstatSync(shortcutPath).isDirectory()) {
                    fs.rmSync(shortcutPath, { recursive: true });
                } else {
                    fs.unlinkSync(shortcutPath);
                }

                // Verify deletion
                if (fs.existsSync(shortcutPath)) {
                    console.error('[ShortcutManager] Shortcut still exists after deletion attempt:', shortcutPath);
                    return {
                        success: false,
                        location,
                        error: 'File still exists after deletion - may be locked by OneDrive or another process',
                    };
                }

                console.log(`[ShortcutManager] Removed shortcut: ${shortcutPath}`);
                return {
                    success: true,
                    location,
                    path: shortcutPath,
                };
            } catch (error: any) {
                console.error('[ShortcutManager] Failed to remove shortcut:', error.message);
                return {
                    success: false,
                    location,
                    error: error.message,
                };
            }
        }

        return {
            success: true,
            location,
            path: shortcutPath || undefined,
        };
    }

    /**
     * Get Windows shortcut directory
     */
    private getWindowsShortcutDirectory(location: ShortcutLocation): string | null {
        switch (location) {
            case 'desktop':
                // Use PowerShell to get correct Desktop path (handles OneDrive redirection)
                try {
                    const result = execSync(
                        'powershell -NoProfile -Command "[Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)"',
                        { encoding: 'utf8', windowsHide: true, timeout: 5000 }
                    );
                    const desktopPath = result.trim();
                    if (desktopPath && fs.existsSync(desktopPath)) {
                        return desktopPath;
                    }
                } catch (e) {
                    console.log('[ShortcutManager] PowerShell desktop path detection failed, using fallback');
                }
                // Fallback to Electron then os.homedir
                try {
                    return app.getPath('desktop');
                } catch {
                    return path.join(os.homedir(), 'Desktop');
                }
            case 'startMenu':
                return path.join(
                    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
                    'Microsoft', 'Windows', 'Start Menu', 'Programs', 'GnuNae'
                );
            case 'applications':
                return null; // Not applicable on Windows
            default:
                return null;
        }
    }

    /**
     * Get macOS shortcut directory
     */
    private getMacOSShortcutDirectory(location: ShortcutLocation): string | null {
        switch (location) {
            case 'desktop':
                // Use Electron's app.getPath for proper path detection
                try {
                    return app.getPath('desktop');
                } catch {
                    return path.join(os.homedir(), 'Desktop');
                }
            case 'applications':
                return path.join(os.homedir(), 'Applications');
            case 'startMenu':
                return null; // Not applicable on macOS
            default:
                return null;
        }
    }

    /**
     * Get Linux shortcut directory
     */
    private getLinuxShortcutDirectory(location: ShortcutLocation): string | null {
        switch (location) {
            case 'desktop':
                // Use Electron's app.getPath, fallback to XDG or home/Desktop
                try {
                    return app.getPath('desktop');
                } catch {
                    return process.env.XDG_DESKTOP_DIR || path.join(os.homedir(), 'Desktop');
                }
            case 'applications':
                return path.join(os.homedir(), '.local', 'share', 'applications');
            case 'startMenu':
                return null; // Not applicable on Linux (use applications)
            default:
                return null;
        }
    }

    /**
     * Get the GnuNae executable path
     */
    private getGnuNaeExecutable(): string {
        if (app.isPackaged) {
            // Packaged app
            switch (this.platform) {
                case 'win32':
                    return path.join(path.dirname(app.getPath('exe')), 'GnuNae.exe');
                case 'darwin':
                    return app.getPath('exe');
                case 'linux':
                    return app.getPath('exe');
                default:
                    return app.getPath('exe');
            }
        } else {
            // Development mode - use electron directly
            return process.execPath;
        }
    }

    /**
     * Get the GnuNae icon path
     */
    private getGnuNaeIcon(): string {
        const assetsDir = path.join(__dirname, '../../assets');
        const devAssetsDir = path.join(__dirname, '../../../assets');

        if (this.platform === 'win32') {
            const iconPath = path.join(assetsDir, 'gnunae.ico');
            if (fs.existsSync(iconPath)) return iconPath;
            return path.join(devAssetsDir, 'gnunae.ico');
        } else {
            const iconPath = path.join(assetsDir, 'gnunae.png');
            if (fs.existsSync(iconPath)) return iconPath;
            return path.join(devAssetsDir, 'gnunae.png');
        }
    }

    /**
     * Get browser-specific icon path
     * Uses browser icons (chrome.ico/png, edge.ico/png) instead of generic GnuNae icon
     * Returns .ico on Windows, .png on macOS/Linux
     */
    getBrowserIcon(browserId: string): string {
        const assetsDir = path.join(__dirname, '../../assets');
        const devAssetsDir = path.join(__dirname, '../../../assets');

        // Determine extension based on platform
        const ext = this.platform === 'win32' ? 'ico' : 'png';

        // Map browser IDs to icon filenames
        let iconName: string;
        if (browserId.toLowerCase().includes('chrome')) {
            iconName = `chrome.${ext}`;
        } else if (browserId.toLowerCase().includes('edge')) {
            iconName = `edge.${ext}`;
        } else {
            // Fallback to GnuNae icon for unknown browsers
            return this.getGnuNaeIcon();
        }

        // Try production assets first, then development assets
        const iconPath = path.join(assetsDir, iconName);
        if (fs.existsSync(iconPath)) return iconPath;

        const devIconPath = path.join(devAssetsDir, iconName);
        if (fs.existsSync(devIconPath)) return devIconPath;

        // Final fallback to GnuNae icon
        return this.getGnuNaeIcon();

    }

    /**
     * Get available shortcut locations for current platform
     */
    getAvailableLocations(): ShortcutLocation[] {
        switch (this.platform) {
            case 'win32':
                return ['desktop', 'startMenu'];
            case 'darwin':
                return ['desktop', 'applications'];
            case 'linux':
                return ['desktop', 'applications'];
            default:
                return [];
        }
    }

    /**
     * Get human-readable location names
     */
    getLocationLabel(location: ShortcutLocation): string {
        switch (location) {
            case 'desktop':
                return 'Desktop';
            case 'startMenu':
                return 'Start Menu';
            case 'applications':
                return this.platform === 'darwin' ? 'Applications' : 'Application Menu';
            default:
                return location;
        }
    }
}

// Export singleton instance
export const shortcutManager = new ShortcutManager();
