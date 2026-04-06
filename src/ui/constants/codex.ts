// Shared constants for Codex models and modes
// Both Settings.tsx and CodexSidebar.tsx should import from here

export type CodexModel =
    | 'gpt-5.4'
    | 'gpt-5.4-mini'
    | 'gpt-5.4-nano'
    | 'gpt-5.3-codex'
    | 'gpt-5.2-codex'
    | 'gpt-5.2'
    | 'gpt-5.1-codex-max'
    | 'gpt-5.1-codex'
    | 'gpt-5.1';

export type CodexMode = 'ask' | 'agent' | 'full-access';

export const DEFAULT_MODEL: CodexModel = 'gpt-5.4-mini';
export const DEFAULT_MODE: CodexMode = 'agent';

export const CODEX_MODELS: { value: CodexModel; label: string }[] = [
    { value: 'gpt-5.4', label: 'GPT-5.4' },
    { value: 'gpt-5.4-mini', label: 'GPT-5.4-Mini' },
    { value: 'gpt-5.4-nano', label: 'GPT-5.4-Nano' },
    { value: 'gpt-5.3-codex', label: 'GPT-5.3-Codex' },
    { value: 'gpt-5.2-codex', label: 'GPT-5.2-Codex' },
    { value: 'gpt-5.2', label: 'GPT-5.2' },
    { value: 'gpt-5.1-codex-max', label: 'GPT-5.1-Codex-Max' },
    { value: 'gpt-5.1-codex', label: 'GPT-5.1-Codex' },
    { value: 'gpt-5.1', label: 'GPT-5.1' },
];

export const CODEX_MODES: { value: CodexMode; label: string; icon: string; hint: string }[] = [
    { value: 'ask', label: 'Ask', icon: '💬', hint: 'Read-only' },
    { value: 'agent', label: 'Agent', icon: '🤖', hint: 'Confirms critical actions' },
    { value: 'full-access', label: 'Full Access', icon: '⚡', hint: 'Fully autonomous' },
];

// Helper to get model label with optional (default) suffix
// If savedDefault is provided, use it; otherwise fall back to hardcoded DEFAULT_MODEL
export function getModelLabel(model: CodexModel, savedDefault?: CodexModel): string {
    const m = CODEX_MODELS.find(x => x.value === model);
    const label = m?.label || model;
    const effectiveDefault = savedDefault ?? DEFAULT_MODEL;
    return model === effectiveDefault ? `${label} (default)` : label;
}

