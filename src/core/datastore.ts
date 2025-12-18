import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Persistent Data Store Service
 * Stores user data as key-value pairs in a JSON file.
 * Used by Codex to auto-fill forms and remember user preferences.
 */

export type DataStoreValue = string | number | boolean;
export type DataStoreData = Record<string, DataStoreValue>;

class DataStoreService {
    private data: DataStoreData;
    private filePath: string;

    constructor() {
        // Store in ~/.gnunae/ directory
        const gnunaeDir = path.join(os.homedir(), '.gnunae');
        if (!fs.existsSync(gnunaeDir)) {
            fs.mkdirSync(gnunaeDir, { recursive: true });
        }
        this.filePath = path.join(gnunaeDir, 'datastore.json');
        this.data = this.loadData();
    }

    private loadData(): DataStoreData {
        try {
            if (fs.existsSync(this.filePath)) {
                const content = fs.readFileSync(this.filePath, 'utf8');
                return JSON.parse(content);
            }
        } catch (error) {
            console.log('[DataStore] Failed to load data:', error);
        }
        return {};
    }

    private saveData(): void {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
        } catch (error) {
            console.log('[DataStore] Failed to save data:', error);
        }
    }

    /**
     * Get a value by key
     */
    get(key: string): DataStoreValue | undefined {
        return this.data[key];
    }

    /**
     * Set a value by key
     */
    set(key: string, value: DataStoreValue): void {
        this.data[key] = value;
        this.saveData();
    }

    /**
     * Check if a key exists
     */
    has(key: string): boolean {
        return key in this.data;
    }

    /**
     * Remove a key
     */
    remove(key: string): boolean {
        if (key in this.data) {
            delete this.data[key];
            this.saveData();
            return true;
        }
        return false;
    }

    /**
     * Get all data
     */
    getAll(): DataStoreData {
        return { ...this.data };
    }

    /**
     * Get all data as formatted string for Codex prompt
     */
    getFormatted(): string {
        const entries = Object.entries(this.data);
        if (entries.length === 0) {
            return 'No stored user data.';
        }
        return entries.map(([k, v]) => `- ${k}: ${v}`).join('\n');
    }

    /**
     * Clear all data
     */
    clear(): void {
        this.data = {};
        this.saveData();
    }
}

export const dataStoreService = new DataStoreService();
