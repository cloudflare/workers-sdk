import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import {
	COMPLIANCE_REGION_CONFIG_PUBLIC,
	getCloudflareApiBaseUrl,
	getCloudflareApiEnvironmentFromEnv,
	getGlobalWranglerConfigPath,
	UserError,
} from "@cloudflare/workers-utils";
import { fetch } from "undici";

function getAnonymousPreviewUrl(): string {
	return `${getCloudflareApiBaseUrl(COMPLIANCE_REGION_CONFIG_PUBLIC)}/provisioning/previews`;
}

// The provisioning service requires this exact terms-of-service value.
const TERMS_OF_SERVICE_URL = "https://www.cloudflare.com/terms/";

function getAnonymousAccountConfigFile(): string {
	const environment = getCloudflareApiEnvironmentFromEnv();
	return environment === "production"
		? "wrangler-anonymous-account.json"
		: `wrangler-anonymous-account.${environment}.json`;
}

type AnonymousAccountPayload = {
	account?: {
		id?: string;
		name?: string;
		type?: string;
		apiToken?: string;
		tokenId?: string;
		expiresAt?: string;
	};
	claim?: {
		token?: string;
		url?: string;
		expiresAt?: string;
	};
};

type AnonymousAccountResponse = AnonymousAccountPayload & {
	result?: AnonymousAccountPayload;
};

export type AnonymousPreviewAccount = {
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

type CachedAnonymousPreviewAccount = {
	anonymousPreviewAccount: AnonymousPreviewAccount;
};

function getAnonymousPreviewAccountConfigPath(): string {
	return path.join(
		getGlobalWranglerConfigPath(),
		getAnonymousAccountConfigFile()
	);
}

function readAnonymousPreviewAccountConfig(): Partial<CachedAnonymousPreviewAccount> {
	try {
		return JSON.parse(
			readFileSync(getAnonymousPreviewAccountConfigPath(), "utf-8")
		) as Partial<CachedAnonymousPreviewAccount>;
	} catch {
		return {};
	}
}

function isFutureTimestamp(timestamp: string): boolean {
	const parsed = Date.parse(timestamp);
	return !Number.isNaN(parsed) && parsed > Date.now();
}

export function getCachedAnonymousPreviewAccount():
	| AnonymousPreviewAccount
	| undefined {
	const anonymousPreviewAccount =
		readAnonymousPreviewAccountConfig().anonymousPreviewAccount;

	if (!anonymousPreviewAccount) {
		return undefined;
	}

	if (
		!isFutureTimestamp(anonymousPreviewAccount.account?.expiresAt ?? "") ||
		!isFutureTimestamp(anonymousPreviewAccount.claim?.expiresAt ?? "")
	) {
		return undefined;
	}

	return anonymousPreviewAccount;
}

function cacheAnonymousPreviewAccount(
	anonymousPreviewAccount: AnonymousPreviewAccount
): void {
	const configPath = getAnonymousPreviewAccountConfigPath();
	mkdirSync(path.dirname(configPath), { recursive: true });
	writeFileSync(
		configPath,
		JSON.stringify({ anonymousPreviewAccount }, null, 2)
	);
}

/** Returns whether a cached account existed before removal. */
export function clearCachedAnonymousPreviewAccount(): boolean {
	const configPath = getAnonymousPreviewAccountConfigPath();
	const existed = existsSync(configPath);
	rmSync(configPath, { force: true });
	return existed;
}

export async function createAnonymousPreviewAccount(): Promise<AnonymousPreviewAccount> {
	const response = await fetch(getAnonymousPreviewUrl(), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			termsOfService: TERMS_OF_SERVICE_URL,
			acceptTermsOfService: "yes",
		}),
	});

	if (!response.ok) {
		throw new UserError(
			`Failed to create an anonymous preview account (${response.status} ${response.statusText}).`,
			{ telemetryMessage: "deploy anonymous account create failed" }
		);
	}

	const responseText = await response.text();
	let responseBody: AnonymousAccountResponse;

	try {
		responseBody = JSON.parse(responseText) as AnonymousAccountResponse;
	} catch {
		throw new UserError(
			`Failed to create an anonymous preview account. Received an invalid response (${response.status} ${response.statusText}).`,
			{ telemetryMessage: "deploy anonymous account invalid response" }
		);
	}

	const previewAccount = responseBody.result ?? responseBody;
	const accountId = previewAccount.account?.id;
	const accountName = previewAccount.account?.name;
	const apiToken = previewAccount.account?.apiToken;
	const accountExpiresAt = previewAccount.account?.expiresAt;
	const claimUrl = previewAccount.claim?.url;
	const claimExpiresAt = previewAccount.claim?.expiresAt;

	if (
		accountId === undefined ||
		accountName === undefined ||
		apiToken === undefined ||
		accountExpiresAt === undefined ||
		claimUrl === undefined ||
		claimExpiresAt === undefined
	) {
		throw new UserError(
			"Failed to create an anonymous preview account because the response was missing required fields.",
			{ telemetryMessage: "deploy anonymous account response incomplete" }
		);
	}

	return {
		account: {
			id: accountId,
			name: accountName,
			apiToken,
			expiresAt: accountExpiresAt,
		},
		claim: {
			url: claimUrl,
			expiresAt: claimExpiresAt,
		},
	};
}

export async function getOrCreateAnonymousPreviewAccount(): Promise<{
	account: AnonymousPreviewAccount;
	cached: boolean;
}> {
	const cachedPreviewAccount = getCachedAnonymousPreviewAccount();
	if (cachedPreviewAccount) {
		return { account: cachedPreviewAccount, cached: true };
	}

	const anonymousPreviewAccount = await createAnonymousPreviewAccount();
	cacheAnonymousPreviewAccount(anonymousPreviewAccount);

	return { account: anonymousPreviewAccount, cached: false };
}
