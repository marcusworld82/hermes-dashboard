// Shared UI contracts, copied without local server implementation.


type Kind = 'first' | 'followup';
export type BulkPreviewRow = { id: string; kind: Kind; email?: string; subject?: string; body?: string; draftHash?: string; error?: string };
export type BulkApprovalRow = { id: string; queued: boolean; queueId?: string; error?: string };
