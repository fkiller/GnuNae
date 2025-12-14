import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface AppSettings {
    debug: {
        enabled: boolean;
    };
    browser: {
        startPage: string;
        userAgent: string;
    };
    codex: {
        model: string;
        mode: 'ask' | 'agent' | 'full-access';
    };
    ui: {
        sidebarWidth: number;
        theme: 'dark' | 'light' | 'system';
    };
}

const DEFAULT_SETTINGS: AppSettings = {
    debug: {
        enabled: false,
    },
    browser: {
        startPage: 'https://www.google.com',
        userAgent: '',
    },
    codex: {
        model: 'gpt-5.1-codex-max',
        mode: 'ask',
    },
    ui: {
        sidebarWidth: 380,
        theme: 'dark',
    },
};

class SettingsService {
    private settings: AppSettings;
    private filePath: string;

    constructor() {
        const userDataPath = app?.getPath?.('userData') || '.';
        this.filePath = path.join(userDataPath, 'settings.json');
        this.settings = this.loadSettings();
    }

    private loadSettings(): AppSettings {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf8');
                const loaded = JSON.parse(data);
                // Merge with defaults to handle new settings
                return this.mergeDeep(DEFAULT_SETTINGS, loaded);
            }
        } catch (error) {
            console.log('[Settings] Failed to load settings:', error);
        }
        return { ...DEFAULT_SETTINGS };
    }

    private saveSettings(): void {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2));
        } catch (error) {
            console.log('[Settings] Failed to save settings:', error);
        }
    }

    private mergeDeep(target: any, source: any): any {
        const output = { ...target };
        for (const key of Object.keys(source)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                output[key] = this.mergeDeep(target[key] || {}, source[key]);
            } else {
                output[key] = source[key];
            }
        }
        return output;
    }

    get<K extends keyof AppSettings>(key: K): AppSettings[K] {
        return this.settings[key];
    }

    getAll(): AppSettings {
        return { ...this.settings };
    }

    set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
        this.settings[key] = value;
        this.saveSettings();
    }

    update(partial: Partial<AppSettings>): void {
        this.settings = this.mergeDeep(this.settings, partial);
        this.saveSettings();
    }

    reset(): void {
        this.settings = { ...DEFAULT_SETTINGS };
        this.saveSettings();
    }
}

export const settingsService = new SettingsService();
export { DEFAULT_SETTINGS };
