import crypto from "node:crypto";
import { URL } from "node:url";
import { createWorkerUploadForm } from "@cloudflare/deploy-helpers/create-worker-upload-form";
import { getAccessHeaders } from "@cloudflare/workers-auth";
import {
	APIError,
	fetchResultBase,
	getComplianceRegionSubdomain,
	ParseError,
	parseJSON,
	UserError,
} from "@cloudflare/workers-utils";
import { fetch } from "undici";
import { version as packageVersion } from "../../package.json";
import { logger } from "../logger";
import type { CfWorkerInitWithName } from "./remote";
import type {
	ApiCredentials,
	ComplianceConfig,
} from "@cloudflare/workers-utils";
import type { HeadersInit, RequestInit } from "undici";

/**
 * Maximum time (ms) to wait for an individual preview API request before
 * treating it as a timeout. Without this, a hung API response blocks the
 * entire dev-session reload indefinitely.
 */
const PREVIEW_API_TIMEOUT_MS = 30_000;

function fetchResult<ResponseType>(
	complianceConfig: ComplianceConfig,
	account: CfAccount,
	resource: string,
	init: RequestInit = {},
	abortSignal?: AbortSignal
): Promise<ResponseType> {
	return fetchResultBase(
		complianceConfig,
		resource,
		init,
		`remote-bindings/${packageVersion}`,
		logger,
		undefined,
		abortSignal,
		account.apiToken
	);
}

/**
 * Combine the caller's abort signal with a per-request timeout so that a
 * hung Cloudflare API response doesn't block forever.
 */
function withTimeout(signal: AbortSignal): AbortSignal {
	return AbortSignal.any([signal, AbortSignal.timeout(PREVIEW_API_TIMEOUT_MS)]);
}

async function getOrRegisterWorkersDevSubdomain(
	complianceConfig: ComplianceConfig,
	account: CfAccount,
	abortSignal: AbortSignal
): Promise<string> {
	const resource = `/accounts/${account.accountId}/workers/subdomain`;
	try {
		const { subdomain } = await fetchResult<{ subdomain: string }>(
			complianceConfig,
			account,
			resource,
			undefined,
			abortSignal
		);
		return subdomain;
	} catch (error) {
		if (!(error instanceof APIError) || error.code !== 10007) {
			throw error;
		}
	}

	const subdomain = crypto.randomBytes(4).toString("hex");
	const result = await fetchResult<{ subdomain: string }>(
		complianceConfig,
		account,
		resource,
		{
			method: "PUT",
			body: JSON.stringify({ subdomain }),
		},
		abortSignal
	);
	return result.subdomain;
}

/**
 * A Cloudflare account.
 */

export interface CfAccount {
	/**
	 * An API token.
	 *
	 * @link https://api.cloudflare.com/#user-api-tokens-properties
	 */
	apiToken: ApiCredentials;
	/**
	 * An account ID.
	 */
	accountId: string;
}

/**
 * A Preview Session on the edge
 */
export interface CfPreviewSession {
	/**
	 * A value to use when creating a worker preview under a session
	 */
	value: string;
	/**
	 * The host where the session is available.
	 */
	host: string;
}

/**
 * A preview token.
 */
export interface CfPreviewToken {
	/**
	 * The header value required to trigger a preview.
	 *
	 * @example
	 * const headers = { 'cf-workers-preview-token': value }
	 * const response = await fetch('https://' + host, { headers })
	 */
	value: string;
	/**
	 * The host where the preview is available.
	 */
	host: string;
	/**
	 * A URL that when fetched starts a tail. Essentially, `wrangler tail` for realish previews.
	 *
	 * https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/tail/methods/create/
	 */
	tailUrl?: string;
}

/**
 * Try and get a re-encoded token from the edge. Returns null if the exchange
 * fails for any reason (expected with particular zone settings).
 * Rethrows AbortError so callers can handle cancellation.
 */
async function tryExpandToken(
	exchangeUrl: string,
	abortSignal: AbortSignal
): Promise<string | null> {
	try {
		const switchedExchangeUrl = new URL(exchangeUrl);

		const accessHeaders = await getAccessHeaders(switchedExchangeUrl.hostname, {
			logger,
		});
		const headers: HeadersInit = { ...accessHeaders };

		logger.debug("-- START EXCHANGE API REQUEST:");

		logger.debug("-- END EXCHANGE API REQUEST");
		const exchangeResponse = await fetch(switchedExchangeUrl, {
			signal: abortSignal,
			headers,
		});
		const bodyText = await exchangeResponse.text();
		logger.debug(
			"-- START EXCHANGE API RESPONSE:",
			exchangeResponse.statusText,
			exchangeResponse.status
		);
		logger.debug("HEADERS:", JSON.stringify(exchangeResponse.headers, null, 2));

		logger.debug("-- END EXCHANGE API RESPONSE");

		if (!exchangeResponse.ok) {
			return null;
		}

		const body = parseJSON(bodyText) as {
			token?: string;
		};
		if (typeof body?.token !== "string") {
			return null;
		}
		return body.token;
	} catch (e) {
		if (e instanceof Error && e.name === "AbortError") {
			throw e;
		}
		return null;
	}
}
/**
 * Generates a preview session token.
 */
export async function createPreviewSession(
	complianceConfig: ComplianceConfig,
	account: CfAccount,
	abortSignal: AbortSignal,
	name: string
): Promise<CfPreviewSession> {
	const { accountId } = account;
	const initUrl = `/accounts/${accountId}/workers/subdomain/edge-preview`;

	const { token, exchange_url } = await fetchResult<{
		token: string;
		exchange_url?: string;
	}>(complianceConfig, account, initUrl, undefined, withTimeout(abortSignal));

	const previewSessionToken = exchange_url
		? ((await tryExpandToken(exchange_url, withTimeout(abortSignal))) ?? token)
		: token;

	try {
		const subdomain = await getOrRegisterWorkersDevSubdomain(
			complianceConfig,
			account,
			withTimeout(abortSignal)
		);
		const host = `${name}.${subdomain}${getComplianceRegionSubdomain(complianceConfig)}.workers.dev`;
		return {
			value: previewSessionToken,
			host,
		};
	} catch (e) {
		if (!(e instanceof ParseError)) {
			throw e;
		} else {
			throw new UserError(
				"Could not create remote preview session on your account.",
				{ telemetryMessage: "remote preview session creation failed" }
			);
		}
	}
}

/**
 * Creates a preview token.
 */
export async function createWorkerPreview(
	complianceConfig: ComplianceConfig,
	worker: CfWorkerInitWithName,
	account: CfAccount,
	session: CfPreviewSession,
	abortSignal: AbortSignal
): Promise<CfPreviewToken> {
	const { value, host } = session;
	const { accountId } = account;
	const url = `/accounts/${accountId}/workers/scripts/${worker.name}/edge-preview`;

	const formData = createWorkerUploadForm(worker, worker.bindings);
	formData.set(
		"wrangler-session-config",
		JSON.stringify({ workers_dev: true, minimal_mode: true })
	);

	const { preview_token, tail_url } = await fetchResult<{
		preview_token: string;
		tail_url: string;
	}>(
		complianceConfig,
		account,
		url,
		{
			method: "POST",
			body: formData,
			headers: {
				"cf-preview-upload-config-token": value,
			},
		},
		withTimeout(abortSignal)
	);

	return {
		value: preview_token,
		host,
		tailUrl: tail_url,
	};
}
