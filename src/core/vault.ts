import * as fs from 'fs';
import * as path from 'path';
import type { ResumeSchema } from './schema';

const RESUME_PATH = path.join(process.cwd(), 'resume.full.json');

export class VaultService {
    private cache: ResumeSchema | null = null;

    getResume(): ResumeSchema | null {
        if (this.cache) return this.cache;

        try {
            if (fs.existsSync(RESUME_PATH)) {
                const data = fs.readFileSync(RESUME_PATH, 'utf-8');
                this.cache = JSON.parse(data) as ResumeSchema;
                return this.cache;
            }
        } catch (error) {
            console.error('Failed to read resume:', error);
        }
        return null;
    }

    saveResume(resume: ResumeSchema): void {
        try {
            fs.writeFileSync(RESUME_PATH, JSON.stringify(resume, null, 2), 'utf-8');
            this.cache = resume;
        } catch (error) {
            console.error('Failed to save resume:', error);
            throw error;
        }
    }

    clearCache(): void {
        this.cache = null;
    }
}
