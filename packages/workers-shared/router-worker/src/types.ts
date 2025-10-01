export type Environment = "production" | "staging" | "fed-prod";

export interface ReadyAnalytics {
	logEvent: (e: ReadyAnalyticsEvent) => void;
}

export interface ColoMetadata {
	metalId: number;
	coloId: number;
	coloRegion: string;
	coloTier: number;
}

export interface ReadyAnalyticsEvent {
	accountId?: number;
	indexId?: string;
	version?: number;
	doubles?: (number | undefined)[];
	blobs?: (string | undefined)[];
}
