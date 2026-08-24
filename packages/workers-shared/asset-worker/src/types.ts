import type { AssetConfig } from "../../utils/types";

export type NormalizedAssetConfig = Required<Omit<AssetConfig, "base_path">> & {
	base_path: string;
};

export type Environment = "production" | "staging" | "fed-prod";

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
