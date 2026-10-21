// Shared UI contracts, copied without local server implementation.

export type AgentEditorState = { displayName: string; description: string; model: string; soul: string; enabledSkills: string[] };
export type AgentEditorSnapshot = { ok: boolean; id: string; state: AgentEditorState; revision: string; provider: string; availableModels: string[]; availableSkills: string[]; runtimeNote: string; capabilities: { pause: boolean; dailyBudget: boolean }; history?: { id: string; at: string; status: string }[] };
export type AgentEditorPreview = { ok: boolean; state: AgentEditorState; revision: string; previewHash: string; diff: string; changed: boolean };
