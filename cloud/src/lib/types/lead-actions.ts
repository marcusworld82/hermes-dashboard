// Shared UI contracts, copied without local server implementation.


export type UnifiedLead = {
  id: string; entity: 'companies' | 'people'; name: string; business: string; owner: string; title: string; email: string; phone: string;
  address: string; dateAdded: string; website: string; websiteStatus: string; origin: string; segment: string; tags: string[];
  reason: string; score: number | null; scoreParts: string; confidence: string; contactability: string; stage: string; pauseUntil: string; denialReason: string; doNotContact: boolean;
  notionUrl: string; socials: Record<string, string>; drafts: { email: string; dm: string; callScript: string; followup: string }; lastEdited: string;
  revision: string; evidenceIds: string[]; companyIds: string[];
};
