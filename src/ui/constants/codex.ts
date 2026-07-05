// Shared constants for Codex models and modes
// Model data is generated from https://developers.openai.com/codex/models
// by scripts/update-codex-models.js into src/core/codex-models.json.

import codexModelManifest from '../../core/codex-models.json';

export type CodexModel = string;
export type CodexMode = 'ask' | 'agent' | 'full-access';

export const CODEX_MODELS: { value: CodexModel; label: string }[] = codexModelManifest.models;
export const DEFAULT_MODEL: CodexModel = codexModelManifest.defaultModel;
export const CODEX_MODELS_SOURCE_URL = codexModelManifest.sourceUrl;
export const DEFAULT_MODE: CodexMode = 'agent';

export const CODEX_MODES: { value: CodexMode; label: string; icon: string; hint: string }[] = [
    { value: 'ask', label: 'Ask', icon: '💬', hint: 'Read-only' },
    { value: 'agent', label: 'Agent', icon: '🤖', hint: 'Confirms critical actions' },
    { value: 'full-access', label: 'Full Access', icon: '⚡', hint: 'Fully autonomous' },
];

// Helper to get model label with optional (default) suffix
// If savedDefault is provided, use it; otherwise fall back to generated DEFAULT_MODEL
export function getModelLabel(model: CodexModel, savedDefault?: CodexModel): string {
    const m = CODEX_MODELS.find(x => x.value === model);
    const label = m?.label || model;
    const effectiveDefault = savedDefault ?? DEFAULT_MODEL;
    return model === effectiveDefault ? `${label} (default)` : label;
}
