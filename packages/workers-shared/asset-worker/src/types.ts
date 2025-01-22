export type Environment = "production" | "staging";

export interface ReadyAnalytics {
	logEvent: (e: ReadyAnalyticsEvent) => void;
}

export interface ReadyAnalyticsEvent {
	accountId?: number;
	indexId?: string;
	version?: number;
	doubles?: (number | undefined)[];
	blobs?: (string | undefined)[];
}
