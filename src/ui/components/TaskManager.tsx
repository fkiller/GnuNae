import React, { useState, useEffect, useCallback } from 'react';

interface Task {
    id: string;
    name: string;
    trigger: { type: string; frequency?: string };
    favorited?: boolean;
    enabled: boolean;
    lastRunAt?: string;
}

interface TaskWithNextRun extends Task {
    nextRunIn: number;
}

interface TaskManagerProps {
    onClose: () => void;
}

// Format time remaining in human-readable format
function formatTimeRemaining(ms: number): string {
    if (ms <= 0) return 'Due now';

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `Run in ${days}d`;
    if (hours > 0) return `Run in ${hours}h`;
    if (minutes > 0) return `Run in ${minutes}m`;
    return `Run in ${seconds}s`;
}

const TaskManager: React.FC<TaskManagerProps> = ({ onClose }) => {
    const [favoritedTasks, setFavoritedTasks] = useState<Task[]>([]);
    const [runningTasks, setRunningTasks] = useState<Task[]>([]);
    const [scheduledTasks, setScheduledTasks] = useState<TaskWithNextRun[]>([]);
    const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
    const [canRunMore, setCanRunMore] = useState<boolean>(true);

    const loadTasks = useCallback(async () => {
        const api = (window as any).electronAPI;
        if (!api) return;

        // Get favorited tasks
        const favorited = await api.getFavoritedTasks?.() || [];
        setFavoritedTasks(favorited);

        // Get running tasks
        const running = await api.getRunningTasks?.() || [];
        setRunningTasks(running);

        // Get upcoming scheduled tasks
        const scheduled = await api.getUpcomingScheduledTasks?.() || [];
        setScheduledTasks(scheduled);

        // Check if we can run more tasks
        const canRun = await api.canRunMoreTasks?.() ?? true;
        setCanRunMore(canRun);
    }, []);

    useEffect(() => {
        loadTasks();
        // Refresh every 5 seconds
        const interval = setInterval(loadTasks, 5000);
        return () => clearInterval(interval);
    }, [loadTasks]);

    const handleRunTask = async (taskId: string) => {
        const result = await (window as any).electronAPI?.runTask?.(taskId);
        if (result?.success) {
            loadTasks();
        }
    };

    const handleStopTask = async (taskId: string) => {
        await (window as any).electronAPI?.stopTask?.(taskId);
        loadTasks();
    };

    const handleToggleFavorite = async (taskId: string) => {
        await (window as any).electronAPI?.toggleFavorite?.(taskId);
        loadTasks();
    };

    const renderTaskItem = (task: Task, section: string, isRunning: boolean = false, nextRunIn?: number) => {
        const hoverKey = `${section}-${task.id}`;
        return (
            <div
                key={hoverKey}
                className={`task-manager-item ${isRunning ? 'running' : ''}`}
                onMouseEnter={() => setHoveredTaskId(hoverKey)}
                onMouseLeave={() => setHoveredTaskId(null)}
            >
                <div className="task-manager-item-left">
                    {isRunning && <span className="task-running-icon">⟳</span>}
                    <span className="task-manager-name">{task.name}</span>
                </div>
                <div className="task-manager-item-right">
                    {isRunning ? (
                        <>
                            <span className="task-status running">Running...</span>
                            {hoveredTaskId === hoverKey && (
                                <button
                                    className="task-action-btn stop"
                                    onClick={() => handleStopTask(task.id)}
                                    title="Stop"
                                >
                                    ■
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            {nextRunIn !== undefined && (
                                <span className="task-status scheduled">{formatTimeRemaining(nextRunIn)}</span>
                            )}
                            {hoveredTaskId === hoverKey && (
                                <button
                                    className={`task-action-btn run ${!canRunMore ? 'disabled' : ''}`}
                                    onClick={() => canRunMore && handleRunTask(task.id)}
                                    title={canRunMore ? 'Run now' : 'Max concurrent tasks reached'}
                                    disabled={!canRunMore}
                                >
                                    ▶
                                </button>
                            )}
                        </>
                    )}
                    <button
                        className={`task-favorite-btn ${task.favorited ? 'active' : ''}`}
                        onClick={() => handleToggleFavorite(task.id)}
                        title={task.favorited ? 'Remove from favorites' : 'Add to favorites'}
                    >
                        {task.favorited ? '★' : '☆'}
                    </button>
                </div>
            </div>
        );
    };

    const hasContent = favoritedTasks.length > 0 || runningTasks.length > 0 || scheduledTasks.length > 0;

    return (
        <div className="task-manager">
            <div className="task-manager-header">
                <h3>Task Manager</h3>
            </div>

            <div className="task-manager-content">
                {!hasContent && (
                    <div className="task-manager-empty">
                        <p>No tasks yet.</p>
                        <p className="hint">Create tasks using the Task toggle in Chat mode.</p>
                    </div>
                )}

                {/* Favorited Section */}
                {favoritedTasks.length > 0 && (
                    <>
                        <div className="task-section-header">
                            <span>★ Favorites</span>
                        </div>
                        <div className="task-section">
                            {favoritedTasks.map(task => renderTaskItem(task, 'favorites', runningTasks.some(r => r.id === task.id)))}
                        </div>
                    </>
                )}

                {/* Running Section */}
                {runningTasks.length > 0 && (
                    <>
                        {favoritedTasks.length > 0 && <div className="task-section-divider" />}
                        <div className="task-section-header">
                            <span>⟳ Running</span>
                        </div>
                        <div className="task-section">
                            {runningTasks.map(task => renderTaskItem(task, 'running', true))}
                        </div>
                    </>
                )}

                {/* Scheduled Section */}
                {scheduledTasks.length > 0 && (
                    <>
                        {(favoritedTasks.length > 0 || runningTasks.length > 0) && <div className="task-section-divider" />}
                        <div className="task-section-header">
                            <span>📅 Scheduled</span>
                        </div>
                        <div className="task-section">
                            {scheduledTasks.map(task => renderTaskItem(task, 'scheduled', false, task.nextRunIn))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default TaskManager;
