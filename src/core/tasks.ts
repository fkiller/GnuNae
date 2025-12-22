/**
 * Task Execution System
 * 
 * A Task is a reproducible, optimized web activity that minimizes LLM inference costs
 * by converting commands into executable, optimized flows.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types
// ============================================================================

export type TaskTriggerType = 'one-time' | 'on-going' | 'scheduled';

export interface TaskTriggerOneTime {
    type: 'one-time';
}

export interface TaskTriggerOnGoing {
    type: 'on-going';
    domain: string;  // e.g., "example.com" matches example.com/*
}

export interface TaskTriggerScheduled {
    type: 'scheduled';
    frequency: 'hourly' | 'daily' | 'weekly';
    timing?: string;  // e.g., "09:00" for daily, "Mon 09:00" for weekly
    lastScheduledRun?: string;  // ISO timestamp
}

export type TaskTrigger = TaskTriggerOneTime | TaskTriggerOnGoing | TaskTriggerScheduled;

export type TaskDataType = 'unique' | 'stream';
export type TaskLogicType = 'domain-dependent' | 'domain-independent';

export interface Task {
    id: string;
    name: string;
    originalPrompt: string;      // Full original user prompt
    optimizedPrompt: string;     // Minimized/fast version for execution
    startUrl?: string;           // URL to navigate to before running
    trigger: TaskTrigger;
    dataType: TaskDataType;
    logicType: TaskLogicType;
    createdAt: string;           // ISO timestamp
    lastRunAt?: string;          // ISO timestamp
    lastRunStatus?: 'success' | 'failed' | 'blocked';
    state: Record<string, any>;  // Task-specific storage (stream data, etc.)
    enabled: boolean;
    mode?: 'ask' | 'agent' | 'full-access';
    favorited?: boolean;         // Show in favorites section
}

export interface TaskRunResult {
    success: boolean;
    blocked?: boolean;
    blockReason?: string;  // e.g., "CAPTCHA", "2FA"
    output?: string;
    stateUpdates?: Record<string, any>;
}

// ============================================================================
// Task Service
// ============================================================================

class TaskService {
    private tasks: Map<string, Task> = new Map();
    private filePath: string;
    private runningTasks: Set<string> = new Set();  // Support multiple running tasks
    private maxConcurrency: number = 1;  // Default to 1, can be changed via settings

    constructor() {
        const userDataPath = app?.getPath?.('userData') || '.';
        this.filePath = path.join(userDataPath, 'tasks.json');
        this.loadTasks();
    }

    private loadTasks(): void {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf8');
                const tasksArray: Task[] = JSON.parse(data);
                this.tasks = new Map(tasksArray.map(t => [t.id, t]));
                console.log(`[Tasks] Loaded ${this.tasks.size} tasks`);
            }
        } catch (error) {
            console.error('[Tasks] Failed to load tasks:', error);
        }
    }

    private saveTasks(): void {
        try {
            const tasksArray = Array.from(this.tasks.values());
            fs.writeFileSync(this.filePath, JSON.stringify(tasksArray, null, 2));
        } catch (error) {
            console.error('[Tasks] Failed to save tasks:', error);
        }
    }

    // CRUD Operations

    createTask(taskData: Omit<Task, 'id' | 'createdAt' | 'state' | 'enabled'>): Task {
        const task: Task = {
            ...taskData,
            id: uuidv4(),
            createdAt: new Date().toISOString(),
            state: {},
            enabled: true,
        };
        this.tasks.set(task.id, task);
        this.saveTasks();
        console.log(`[Tasks] Created task: ${task.name} (${task.id})`);
        return task;
    }

    getTask(id: string): Task | undefined {
        return this.tasks.get(id);
    }

    getAllTasks(): Task[] {
        return Array.from(this.tasks.values());
    }

    updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>): Task | undefined {
        const task = this.tasks.get(id);
        if (!task) return undefined;

        const updated = { ...task, ...updates };
        this.tasks.set(id, updated);
        this.saveTasks();
        console.log(`[Tasks] Updated task: ${updated.name} (${id})`);
        return updated;
    }

    deleteTask(id: string): boolean {
        const deleted = this.tasks.delete(id);
        if (deleted) {
            this.saveTasks();
            console.log(`[Tasks] Deleted task: ${id}`);
        }
        return deleted;
    }

    // State Management

    updateTaskState(id: string, stateUpdates: Record<string, any>): Task | undefined {
        const task = this.tasks.get(id);
        if (!task) return undefined;

        // For stream data, merge with existing state using timestamps for deduplication
        const newState = { ...task.state };
        for (const [key, value] of Object.entries(stateUpdates)) {
            if (Array.isArray(value) && Array.isArray(newState[key])) {
                // Deduplicate by timestamp if items have timestamps
                const existing = newState[key] as any[];
                const merged = [...existing];
                for (const item of value) {
                    if (item.timestamp) {
                        const exists = merged.some(e => e.timestamp === item.timestamp);
                        if (!exists) merged.push(item);
                    } else {
                        merged.push(item);
                    }
                }
                newState[key] = merged;
            } else {
                newState[key] = value;
            }
        }

        return this.updateTask(id, { state: newState });
    }

    // Domain Matching for On-going Triggers

    getTasksForDomain(url: string): Task[] {
        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname;

            return this.getAllTasks().filter(task => {
                if (task.trigger.type !== 'on-going') return false;
                if (!task.enabled) return false;

                const triggerDomain = (task.trigger as TaskTriggerOnGoing).domain;
                // Match exact domain or subdomain
                return domain === triggerDomain || domain.endsWith('.' + triggerDomain);
            });
        } catch {
            return [];
        }
    }

    // Scheduled Tasks

    getScheduledTasksDue(): Task[] {
        const now = new Date();

        return this.getAllTasks().filter(task => {
            if (task.trigger.type !== 'scheduled') return false;
            if (!task.enabled) return false;

            const trigger = task.trigger as TaskTriggerScheduled;
            const lastRun = trigger.lastScheduledRun ? new Date(trigger.lastScheduledRun) : null;

            const hourMs = 60 * 60 * 1000;
            const dayMs = 24 * hourMs;
            const weekMs = 7 * dayMs;

            let intervalMs: number;
            switch (trigger.frequency) {
                case 'hourly': intervalMs = hourMs; break;
                case 'daily': intervalMs = dayMs; break;
                case 'weekly': intervalMs = weekMs; break;
                default: return false;
            }

            if (lastRun) {
                // Has run before - check if enough time has passed
                const msSinceLastRun = now.getTime() - lastRun.getTime();
                return msSinceLastRun >= intervalMs;
            } else if (trigger.timing) {
                // Never run - check if the scheduled time has arrived
                const [hours, minutes] = trigger.timing.split(':').map(Number);
                const scheduledTime = new Date(now);
                scheduledTime.setHours(hours, minutes, 0, 0);

                // Task is due if we're within 1 minute window of scheduled time
                // and we haven't passed it by more than 5 minutes
                const diff = now.getTime() - scheduledTime.getTime();
                return diff >= 0 && diff <= 5 * 60 * 1000; // Within 5 minute window
            } else {
                // No timing specified - don't auto-run
                return false;
            }
        });
    }

    markScheduledTaskRun(id: string): void {
        const task = this.tasks.get(id);
        if (task && task.trigger.type === 'scheduled') {
            const trigger = task.trigger as TaskTriggerScheduled;
            trigger.lastScheduledRun = new Date().toISOString();
            this.saveTasks();
        }
    }

    // Concurrency Control

    isTaskRunning(): boolean {
        return this.runningTasks.size > 0;
    }

    getRunningTaskIds(): string[] {
        return Array.from(this.runningTasks);
    }

    canRunMoreTasks(): boolean {
        return this.runningTasks.size < this.maxConcurrency;
    }

    setMaxConcurrency(max: number): void {
        this.maxConcurrency = Math.max(1, max);
    }

    getCurrentRunningTaskId(): string | null {
        // For backwards compatibility, return first running task
        const first = this.runningTasks.values().next();
        return first.done ? null : first.value;
    }

    setTaskRunning(taskId: string | null): void {
        if (taskId === null) {
            // Clear all (legacy behavior)
            this.runningTasks.clear();
        } else {
            this.runningTasks.add(taskId);
        }
    }

    clearTaskRunning(taskId: string): void {
        this.runningTasks.delete(taskId);
    }

    getRunningTasks(): Task[] {
        return this.getRunningTaskIds()
            .map(id => this.getTask(id))
            .filter((t): t is Task => t !== undefined);
    }

    // Get scheduled tasks with next run info
    getUpcomingScheduledTasks(): Array<Task & { nextRunIn: number }> {
        const now = new Date();

        return this.getAllTasks()
            .filter(task => {
                if (task.trigger.type !== 'scheduled') return false;
                if (!task.enabled) return false;
                // Don't filter out running tasks - they should still show in favorites,
                // but we won't show them in the scheduled section (handled by TaskManager)
                return true;
            })
            .map(task => {
                const trigger = task.trigger as TaskTriggerScheduled;
                const lastRun = trigger.lastScheduledRun ? new Date(trigger.lastScheduledRun) : null;

                const hourMs = 60 * 60 * 1000;
                const dayMs = 24 * hourMs;
                const weekMs = 7 * dayMs;

                let intervalMs: number;
                switch (trigger.frequency) {
                    case 'hourly': intervalMs = hourMs; break;
                    case 'daily': intervalMs = dayMs; break;
                    case 'weekly': intervalMs = weekMs; break;
                    default: intervalMs = dayMs;
                }

                let nextRunTime: Date;

                if (lastRun) {
                    // Calculate from last run
                    nextRunTime = new Date(lastRun.getTime() + intervalMs);
                } else if (trigger.timing) {
                    // Never run, calculate from timing (e.g., "09:00")
                    const [hours, minutes] = trigger.timing.split(':').map(Number);
                    nextRunTime = new Date(now);
                    nextRunTime.setHours(hours, minutes, 0, 0);

                    // If the time has passed today, schedule for tomorrow
                    if (nextRunTime <= now) {
                        nextRunTime.setDate(nextRunTime.getDate() + 1);
                    }
                } else {
                    // No lastRun and no timing - schedule an interval from now
                    nextRunTime = new Date(now.getTime() + intervalMs);
                }

                const nextRunIn = nextRunTime.getTime() - now.getTime();

                return { ...task, nextRunIn: Math.max(0, nextRunIn) };
            })
            .filter(task => !this.runningTasks.has(task.id)) // Don't show running tasks in scheduled list
            .sort((a, b) => a.nextRunIn - b.nextRunIn);
    }

    // Toggle favorite status
    toggleFavorite(id: string): Task | undefined {
        const task = this.tasks.get(id);
        if (!task) return undefined;
        return this.updateTask(id, { favorited: !task.favorited });
    }

    // Get favorited tasks
    getFavoritedTasks(): Task[] {
        return this.getAllTasks()
            .filter(task => task.favorited)
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    // Record run result

    recordRunResult(id: string, result: TaskRunResult): void {
        const status = result.blocked ? 'blocked' : (result.success ? 'success' : 'failed');
        this.updateTask(id, {
            lastRunAt: new Date().toISOString(),
            lastRunStatus: status,
        });

        if (result.stateUpdates) {
            this.updateTaskState(id, result.stateUpdates);
        }
    }
}

// Singleton instance
export const taskService = new TaskService();
