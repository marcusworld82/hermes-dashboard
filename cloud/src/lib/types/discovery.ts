// Shared UI contracts, copied without local server implementation.

export type DiscoveryKind = 'side-hustle' | 'real-estate';
export type DiscoveryPlan = { kind: DiscoveryKind; actor: string; label: string; target: number; input: Record<string, unknown>; units: Record<string, number>; dailyCapUsd: number; estimateUsd: number; reservedCapUsd: number; verifiedAt: string; build: string; note: string; draftContext?: Record<string,string> };
export type DiscoveryJob = { id: string; plan: DiscoveryPlan; phase: string; createdAt: string; updatedAt?: string; approved: boolean; approvedCapUsd: number; runId?: string; actorStatus?: string; actualUsd?: number | null; found?: number; rawCount?: number; error?: string | null; recordsPath?: string; syncCommand?: string[]; syncCwd?: string };
