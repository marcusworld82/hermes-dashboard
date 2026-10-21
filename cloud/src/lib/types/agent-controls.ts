// Shared UI contracts, copied without local server implementation.

export type AgentPolicy = { paused: boolean; dailyBudgetUsd: number | null };
export type AgentRunOptions = { operation: string; billing: 'subscription' | 'api' | 'unknown'; maxCostUsd?: number };
export type AgentControlActivity = AgentPolicy & { day: string; knownCostUsd: number; reservedUsd: number; unknownCostRuns: number; subscriptionRuns: number; activeRuns: number; lastMessage: string | null; lastRunAt: number | null; scope: string };
