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
import { TEMPORARY_TERMS_URLS } from "../user/temporary-terms-policy";

function getTemporaryPreviewUrl(): string {
	return `${getCloudflareApiBaseUrl(COMPLIANCE_REGION_CONFIG_PUBLIC)}/provisioning/previews`;
}

function getTemporaryAccountConfigFile(): string {
	const environment = getCloudflareApiEnvironmentFromEnv();
	return environment === "production"
		? "wrangler-temporary-account.json"
		: `wrangler-temporary-account.${environment}.json`;
}

type TemporaryAccountPayload = {
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

type TemporaryAccountResponse = TemporaryAccountPayload & {
	result?: TemporaryAccountPayload;
};

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

type CachedTemporaryPreviewAccount = {
	temporaryPreviewAccount: TemporaryPreviewAccount;
};

function getTemporaryPreviewAccountConfigPath(): string {
	return path.join(
		getGlobalWranglerConfigPath(),
		getTemporaryAccountConfigFile()
	);
}

function readTemporaryPreviewAccountConfig(): Partial<CachedTemporaryPreviewAccount> {
	try {
		return JSON.parse(
			readFileSync(getTemporaryPreviewAccountConfigPath(), "utf-8")
		) as Partial<CachedTemporaryPreviewAccount>;
	} catch {
		return {};
	}
}

function isFutureTimestamp(timestamp: string): boolean {
	const parsed = Date.parse(timestamp);
	return !Number.isNaN(parsed) && parsed > Date.now();
}

export function getCachedTemporaryPreviewAccount():
	| TemporaryPreviewAccount
	| undefined {
	const temporaryPreviewAccount =
		readTemporaryPreviewAccountConfig().temporaryPreviewAccount;

	if (!temporaryPreviewAccount) {
		return undefined;
	}

	if (
		!temporaryPreviewAccount.account?.id ||
		!temporaryPreviewAccount.account?.apiToken ||
		!temporaryPreviewAccount.account?.name ||
		!temporaryPreviewAccount.claim?.url ||
		!isFutureTimestamp(temporaryPreviewAccount.account?.expiresAt ?? "") ||
		!isFutureTimestamp(temporaryPreviewAccount.claim?.expiresAt ?? "")
	) {
		return undefined;
	}

	return temporaryPreviewAccount;
}

function cacheTemporaryPreviewAccount(
	temporaryPreviewAccount: TemporaryPreviewAccount
): void {
	const configPath = getTemporaryPreviewAccountConfigPath();
	mkdirSync(path.dirname(configPath), { recursive: true });
	writeFileSync(
		configPath,
		JSON.stringify({ temporaryPreviewAccount }, null, 2)
	);
}

/** Returns whether a cached account existed before removal. */
export function clearCachedTemporaryPreviewAccount(): boolean {
	const configPath = getTemporaryPreviewAccountConfigPath();
	const existed = existsSync(configPath);
	rmSync(configPath, { force: true });
	return existed;
}

export async function createTemporaryPreviewAccount(): Promise<TemporaryPreviewAccount> {
	const response = await fetch(getTemporaryPreviewUrl(), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			termsOfService: TEMPORARY_TERMS_URLS.termsOfService,
			privacyPolicy: TEMPORARY_TERMS_URLS.privacyPolicy,
			acceptTermsOfService: "yes",
		}),
	});

	if (!response.ok) {
		throw new UserError(
			`Failed to create a temporary preview account (${response.status} ${response.statusText}).`,
			{ telemetryMessage: "deploy temporary account create failed" }
		);
	}

	let responseBody: TemporaryAccountResponse;

	try {
		responseBody = (await response.json()) as TemporaryAccountResponse;
	} catch {
		throw new UserError(
			`Failed to create a temporary preview account. Received an invalid response (${response.status} ${response.statusText}).`,
			{ telemetryMessage: "deploy temporary account invalid response" }
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
			"Failed to create a temporary preview account because the response was missing required fields.",
			{ telemetryMessage: "deploy temporary account response incomplete" }
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

export async function getOrCreateTemporaryPreviewAccount(options?: {
	beforeCreate?: () => Promise<void>;
}): Promise<{
	account: TemporaryPreviewAccount;
	cached: boolean;
}> {
	const cachedPreviewAccount = getCachedTemporaryPreviewAccount();
	if (cachedPreviewAccount) {
		return { account: cachedPreviewAccount, cached: true };
	}

	await options?.beforeCreate?.();

	const temporaryPreviewAccount = await createTemporaryPreviewAccount();
	cacheTemporaryPreviewAccount(temporaryPreviewAccount);

	return { account: temporaryPreviewAccount, cached: false };
}
