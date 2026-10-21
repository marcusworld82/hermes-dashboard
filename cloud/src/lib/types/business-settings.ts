// Shared UI contracts, copied without local server implementation.

export type ResearchSource = { id: string; type: 'subreddit' | 'reddit-search' | 'youtube' | 'x' | 'instagram' | 'website' | 'rss' | 'newsletter'; value: string; enabled: boolean; notes: string };
export type BusinessSettings = {
  automaticMorningRun: boolean; senderEnabled: boolean; dailyScrapeCapUsd: number;
  dailyEmailLimit: number; weekendSending: boolean;
  hotThreshold: number; warmThreshold: number;
  services: string; niche: string; location: string; portfolioUrl: string;
  senderName: string; businessName: string; signature: string; postalAddress: string;
  sources: ResearchSource[];
};
