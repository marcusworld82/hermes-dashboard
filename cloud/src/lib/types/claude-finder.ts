// Shared UI contracts, copied without local server implementation.

import type { IntakeLead } from './lead-intake';
export type FinderJob={id:string;status:'queued'|'running'|'complete'|'failed';startedAt:string;finishedAt?:string;log:string[];leads:IntakeLead[];error?:string};
