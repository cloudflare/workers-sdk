import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
	getGlobalWranglerConfigPath,
	UserError,
} from "@cloudflare/workers-utils";
import { fetch } from "undici";

const ANONYMOUS_ACCOUNT_PREVIEW_URL =
	"https://api.cloudflare.com/client/v4/provisioning/previews";
const ANONYMOUS_ACCOUNT_CONFIG_FILE = "wrangler-anonymous-account.json";

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
		ANONYMOUS_ACCOUNT_CONFIG_FILE
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

export function clearCachedAnonymousPreviewAccount(): void {
	rmSync(getAnonymousPreviewAccountConfigPath(), { force: true });
}

export async function createAnonymousPreviewAccount(): Promise<AnonymousPreviewAccount> {
	const response = await fetch(ANONYMOUS_ACCOUNT_PREVIEW_URL, {
		method: "POST",
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
