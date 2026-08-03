import type { ConfigStorage } from ".";

/**
 * A short-lived "temporary preview account"
 */
export type TemporaryPreviewAccount = {
	account: {
		id: string;
		name: string;
		apiToken: string;
		expiresAt: string;
	};
	claim: {
		url: string;
		expiresAt: string;
	};
};

export type TemporaryAccountStorage = ConfigStorage<TemporaryPreviewAccount>;
