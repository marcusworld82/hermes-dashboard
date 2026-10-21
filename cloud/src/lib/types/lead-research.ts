// Shared UI contracts, copied without local server implementation.

export type ResearchRow = Record<string, unknown>;
export type ResearchBase = { id: string; notionUrl: string; name: string; stableId: string; lastEdited: string };
export type ResearchCompany = ResearchBase & {
  segment: string; leadType: string; origin: string; website: string; websiteStatus: string; websiteFindings: string;
  ecommercePlatform: string; email: string; phone: string; contactForm: string; address: string;
  owner: string; tags: string[]; reason: string; score: number | null; scoreParts: string; confidence: string;
  contactability: string; stage: string; pauseUntil: string; denialReason: string; outreachStatus: string; dateAdded: string; lastChecked: string;
  socials: Record<string, string>; peopleIds: string[]; opportunityIds: string[]; evidenceIds: string[];
  drafts: { email: string; dm: string; callScript: string; followup: string };
};
export type ResearchPerson = ResearchBase & Pick<ResearchCompany, 'stage' | 'drafts' | 'origin' | 'tags' | 'reason' | 'socials' | 'dateAdded' | 'scoreParts' | 'pauseUntil' | 'denialReason'> & { title: string; email: string; phone: string; linkedIn: string; location: string; decisionRole: string; employmentVerification: string; roleEvidenceUrl: string; lastVerified: string; confidence: string; companyIds: string[]; evidenceIds: string[]; opportunityIds: string[] };
export type ResearchOpportunity = ResearchBase & { type: string; platform: string; sourceUrl: string; postedDate: string; observedDate: string; finding: string; reason: string; service: string; confidence: string; status: string; companyIds: string[]; peopleIds: string[]; evidenceIds: string[] };
export type ResearchEvidence = ResearchBase & { type: string; platform: string; sourceUrl: string; observation: string; quote: string; observedDate: string; confidence: string; companyIds: string[]; peopleIds: string[]; opportunityIds: string[] };
export type ResearchRun = ResearchBase & { started: string; ended: string; segment: string; mode: string; results: number | null; newRecords: number | null; costUsd: number | null; errors: string; checkpoint: string; runIds: string };
export type LeadResearchCache = { companies: ResearchCompany[]; people: ResearchPerson[]; opportunities: ResearchOpportunity[]; evidence: ResearchEvidence[]; runLog: ResearchRun[]; checkedAt: string | null; attemptedAt: string | null; error: string | null };
