/**
 * Tray Manager - System tray icon management for GnuNae
 * 
 * Provides cross-platform system tray support:
 * - Windows: System tray icon in the taskbar notification area
 * - macOS: Menu bar icon
 * - Linux: AppIndicator (if available) or system tray fallback
 */

import { Tray, Menu, nativeImage, app, BrowserWindow, MenuItemConstructorOptions } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export interface TrayManagerOptions {
    onShowWindow: () => void;
    onHideWindow: () => void;
    onQuit: () => void;
    onOpenSettings: () => void;
    onExternalBrowserLaunch?: (browserId: string) => void;
    getDetectedBrowsers?: () => Promise<{ id: string; name: string }[]>;
}

export class TrayManager {
    private tray: Tray | null = null;
    private options: TrayManagerOptions;
    private isWindowVisible = true;

    constructor(options: TrayManagerOptions) {
        this.options = options;
    }

    /**
     * Initialize the system tray icon
     */
    async initialize(): Promise<void> {
        const iconPath = this.getTrayIconPath();

        // Create native image for tray
        let trayIcon: Electron.NativeImage;

        if (fs.existsSync(iconPath)) {
            trayIcon = nativeImage.createFromPath(iconPath);
            // Resize for appropriate tray size
            if (process.platform === 'darwin') {
                // macOS menu bar icons should be 16x16 or 22x22
                trayIcon = trayIcon.resize({ width: 16, height: 16 });
            } else {
                // Windows/Linux typically use 16x16 or 32x32
                trayIcon = trayIcon.resize({ width: 16, height: 16 });
            }
        } else {
            // Create a placeholder icon if none exists
            console.log('[TrayManager] Tray icon not found, using placeholder');
            trayIcon = this.createPlaceholderIcon();
        }

        this.tray = new Tray(trayIcon);
        this.tray.setToolTip('GnuNae - AI Browser');

        // Build and set the context menu
        await this.updateContextMenu();

        // Handle click on tray icon
        this.tray.on('click', () => {
            this.toggleWindowVisibility();
        });

        // On Windows, double-click shows window
        if (process.platform === 'win32') {
            this.tray.on('double-click', () => {
                this.options.onShowWindow();
                this.isWindowVisible = true;
            });
        }

        console.log('[TrayManager] System tray initialized');
    }

    /**
     * Get the path to the tray icon based on platform
     */
    private getTrayIconPath(): string {
        const assetsDir = path.join(__dirname, '../../assets');
        const devAssetsDir = path.join(__dirname, '../../../assets');

        let iconName: string;

        if (process.platform === 'darwin') {
            // macOS uses template images for proper dark/light mode support
            iconName = 'tray-iconTemplate.png';
        } else if (process.platform === 'win32') {
            iconName = 'tray-icon.ico';
        } else {
            iconName = 'tray-icon.png';
        }

        // Try production path first
        const prodPath = path.join(assetsDir, iconName);
        if (fs.existsSync(prodPath)) {
            return prodPath;
        }

        // Try development path
        const devPath = path.join(devAssetsDir, iconName);
        if (fs.existsSync(devPath)) {
            return devPath;
        }

        // Fallback to main icon
        const mainIconPng = path.join(assetsDir, 'gnunae.png');
        if (fs.existsSync(mainIconPng)) {
            return mainIconPng;
        }

        const devMainIconPng = path.join(devAssetsDir, 'gnunae.png');
        return devMainIconPng;
    }

    /**
     * Create a simple placeholder icon
     */
    private createPlaceholderIcon(): Electron.NativeImage {
        // Create a small colored square as placeholder
        // This is a 16x16 PNG in base64
        const placeholderBase64 =
            'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGklEQVQ4jWNgGAWjYBSMglEwCkbBKBgFVAcACBAAAc3pZA0AAAAASUVORK5CYII=';

        return nativeImage.createFromDataURL(`data:image/png;base64,${placeholderBase64}`);
    }

    /**
     * Update the tray context menu
     */
    async updateContextMenu(detectedBrowsers?: { id: string; name: string }[]): Promise<void> {
        if (!this.tray) return;

        const menuTemplate: MenuItemConstructorOptions[] = [
            {
                label: this.isWindowVisible ? 'Hide Window' : 'Show Window',
                click: () => this.toggleWindowVisibility(),
            },
            { type: 'separator' },
        ];

        // Add external browser launch options if available
        if (detectedBrowsers && detectedBrowsers.length > 0 && this.options.onExternalBrowserLaunch) {
            const browserSubmenu: MenuItemConstructorOptions[] = detectedBrowsers.map(browser => ({
                label: browser.name,
                click: () => this.options.onExternalBrowserLaunch?.(browser.id),
            }));

            menuTemplate.push({
                label: 'Launch with Browser',
                submenu: browserSubmenu,
            });
            menuTemplate.push({ type: 'separator' });
        } else if (this.options.getDetectedBrowsers) {
            // Lazy load browsers if getter is available
            try {
                const browsers = await this.options.getDetectedBrowsers();
                if (browsers.length > 0 && this.options.onExternalBrowserLaunch) {
                    const browserSubmenu: MenuItemConstructorOptions[] = browsers.map(browser => ({
                        label: browser.name,
                        click: () => this.options.onExternalBrowserLaunch?.(browser.id),
                    }));

                    menuTemplate.push({
                        label: 'Launch with Browser',
                        submenu: browserSubmenu,
                    });
                    menuTemplate.push({ type: 'separator' });
                }
            } catch (error) {
                console.log('[TrayManager] Failed to get detected browsers:', error);
            }
        }

        menuTemplate.push(
            {
                label: 'Settings',
                click: () => this.options.onOpenSettings(),
            },
            { type: 'separator' },
            {
                label: 'Quit GnuNae',
                click: () => this.options.onQuit(),
            }
        );

        const contextMenu = Menu.buildFromTemplate(menuTemplate);
        this.tray.setContextMenu(contextMenu);
    }

    /**
     * Toggle window visibility
     */
    private toggleWindowVisibility(): void {
        if (this.isWindowVisible) {
            this.options.onHideWindow();
            this.isWindowVisible = false;
        } else {
            this.options.onShowWindow();
            this.isWindowVisible = true;
        }
        this.updateContextMenu();
    }

    /**
     * Set window visibility state (called when window is shown/hidden externally)
     */
    setWindowVisible(visible: boolean): void {
        this.isWindowVisible = visible;
        this.updateContextMenu();
    }

    /**
     * Show a notification balloon/notification
     */
    showNotification(title: string, content: string): void {
        if (!this.tray) return;

        // Windows supports balloon notifications
        if (process.platform === 'win32') {
            this.tray.displayBalloon({
                title,
                content,
                iconType: 'info',
            });
        }
    }

    /**
     * Destroy the tray icon
     */
    destroy(): void {
        if (this.tray) {
            this.tray.destroy();
            this.tray = null;
        }
    }

    /**
     * Check if tray is initialized
     */
    isInitialized(): boolean {
        return this.tray !== null;
    }
}
