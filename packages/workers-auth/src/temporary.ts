import {
	COMPLIANCE_REGION_CONFIG_PUBLIC,
	getCloudflareApiBaseUrl,
	UserError,
} from "@cloudflare/workers-utils";
import { fetch } from "undici";
import type {
	TemporaryAccountStorage,
	TemporaryPreviewAccount,
} from "./config-file/temporary";

export const TEMPORARY_TERMS_URLS = {
	termsOfService: "https://www.cloudflare.com/terms/",
	privacyPolicy: "https://www.cloudflare.com/privacypolicy/",
} as const;

export const TEMPORARY_TERMS_PROMPT = `You must accept Cloudflare's Terms of Service (${TEMPORARY_TERMS_URLS.termsOfService}) and Privacy Policy (${TEMPORARY_TERMS_URLS.privacyPolicy}) in order to continue. By typing "yes", you agree to these terms. Type "yes" to continue.`;
export const TEMPORARY_TERMS_NOTICE = `Continuing means you accept Cloudflare's Terms of Service (${TEMPORARY_TERMS_URLS.termsOfService}) and Privacy Policy (${TEMPORARY_TERMS_URLS.privacyPolicy}).`;

const TEMPORARY_TERMS_ERROR = `You must accept Cloudflare's Terms of Service (${TEMPORARY_TERMS_URLS.termsOfService}) and Privacy Policy (${TEMPORARY_TERMS_URLS.privacyPolicy}) to use --temporary.`;

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

type TemporaryAccountResponse = {
	result?: TemporaryAccountPayload;
};

function getTemporaryPreviewUrl(): string {
	return `${getCloudflareApiBaseUrl(COMPLIANCE_REGION_CONFIG_PUBLIC)}/provisioning/previews`;
}

function isFutureTimestamp(timestamp: string): boolean {
	const parsed = Date.parse(timestamp);
	return !Number.isNaN(parsed) && parsed > Date.now();
}

/**
 * Read the cached temporary preview account from the injected storage,
 * validating that it has all required fields and that neither the account nor
 * the claim has expired. Returns `undefined` when there is no usable cache.
 */
export function getCachedTemporaryPreviewAccount(
	storage: TemporaryAccountStorage
): TemporaryPreviewAccount | undefined {
	let temporaryPreviewAccount: TemporaryPreviewAccount | undefined;
	try {
		temporaryPreviewAccount = storage.read();
	} catch {
		return undefined;
	}

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

/**
 * Provision a brand new temporary preview account from the public provisioning
 * endpoint
 */
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

	const previewAccount = responseBody.result;
	const accountId = previewAccount?.account?.id;
	const accountName = previewAccount?.account?.name;
	const apiToken = previewAccount?.account?.apiToken;
	const accountExpiresAt = previewAccount?.account?.expiresAt;
	const claimUrl = previewAccount?.claim?.url;
	const claimExpiresAt = previewAccount?.claim?.expiresAt;

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

/**
 * Return the cached temporary preview account if one is still valid, otherwise
 * mint a fresh one (running `beforeCreate` first, e.g. a terms-acceptance gate)
 * and persist it to the injected storage.
 */
export async function getOrCreateTemporaryPreviewAccount(options: {
	storage: TemporaryAccountStorage;
	prompt: (question: string, notice: string) => Promise<boolean>;
}): Promise<{
	account: TemporaryPreviewAccount;
	cached: boolean;
}> {
	const cachedPreviewAccount = getCachedTemporaryPreviewAccount(
		options.storage
	);
	if (cachedPreviewAccount) {
		return { account: cachedPreviewAccount, cached: true };
	}

	const termsAccepted = await options.prompt(
		TEMPORARY_TERMS_PROMPT,
		TEMPORARY_TERMS_NOTICE
	);

	if (!termsAccepted) {
		throw new UserError(TEMPORARY_TERMS_ERROR, {
			telemetryMessage: "user temporary terms not accepted",
		});
	}

	const temporaryPreviewAccount = await createTemporaryPreviewAccount();
	options.storage.write(temporaryPreviewAccount);

	return { account: temporaryPreviewAccount, cached: false };
}
