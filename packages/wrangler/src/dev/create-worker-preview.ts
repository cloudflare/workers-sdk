import crypto from "node:crypto";
import { URL } from "node:url";
import { ParseError, parseJSON, UserError } from "@cloudflare/workers-utils";
import { fetch } from "undici";
import { fetchResult } from "../cfetch";
import { createWorkerUploadForm } from "../deployment-bundle/create-worker-upload-form";
import { logger } from "../logger";
import { getWorkersDevSubdomain } from "../routes";
import { getAccessToken } from "../user/access";
import type { ApiCredentials } from "../user";
import type { CfWorkerInitWithName } from "./remote";
import type {
	CfWorkerContext,
	ComplianceConfig,
} from "@cloudflare/workers-utils";
import type { HeadersInit } from "undici";

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
	/**
	 * The worker name used when the session was created.
	 * Used to detect when the session needs to be recreated.
	 */
	name: string | undefined;
}

/**
 * Session configuration for realish preview. This is sent to the API as the
 * `wrangler-session-config` form data part.
 *
 * Only one of `workers_dev` and `routes` can be specified:
 * * If `workers_dev` is set, the preview will run using a `workers.dev` subdomain.
 * * If `routes` is set, the preview will run using the list of routes provided, which must be under a single zone
 *
 * `minimal_mode` is a flag to tell the API to enable "raw" mode bindings in this session
 */
type CfPreviewMode =
	| {
			workers_dev: true;
			minimal_mode?: boolean;
	  }
	| {
			routes: string[];
			minimal_mode?: boolean;
	  };

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

// URLs are often relative to the zone. Sometimes the base zone
// will be grey-clouded, and so the host must be swapped out for
// the worker route host, which is more likely to be orange-clouded.
// However, this switching should only happen if we're running a zone preview
// rather than a workers.dev preview
function switchHost(
	originalUrl: string,
	host: string | undefined,
	zonePreview: boolean
): URL {
	const url = new URL(originalUrl);
	url.hostname = zonePreview ? (host ?? url.hostname) : url.hostname;
	return url;
}

/**
 * Try and get a re-encoded token from the edge. Returns null if the exchange
 * fails for any reason (expected with particular zone settings).
 * Rethrows AbortError so callers can handle cancellation.
 */
async function tryExpandToken(
	exchangeUrl: string,
	ctx: CfWorkerContext,
	abortSignal: AbortSignal
): Promise<string | null> {
	try {
		const switchedExchangeUrl = switchHost(exchangeUrl, ctx.host, !!ctx.zone);

		const headers: HeadersInit = {};
		const accessToken = await getAccessToken(switchedExchangeUrl.hostname);

		if (accessToken) {
			headers.cookie = `CF_Authorization=${accessToken}`;
		}

		logger.debugWithSanitization(
			"-- START EXCHANGE API REQUEST:",
			` GET ${switchedExchangeUrl.href}`
		);

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
		logger.debugWithSanitization("RESPONSE:", bodyText);

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
	ctx: CfWorkerContext,
	abortSignal: AbortSignal,
	name: string | undefined
): Promise<CfPreviewSession> {
	const { accountId, apiToken } = account;
	const initUrl = ctx.zone
		? `/zones/${ctx.zone}/workers/edge-preview`
		: `/accounts/${accountId}/workers/subdomain/edge-preview`;

	const { token, exchange_url } = await fetchResult<{
		token: string;
		exchange_url?: string;
	}>(complianceConfig, initUrl, undefined, undefined, abortSignal, apiToken);

	const previewSessionToken = exchange_url
		? ((await tryExpandToken(exchange_url, ctx, abortSignal)) ?? token)
		: token;

	try {
		let host = ctx.host;
		if (!host) {
			const subdomain = await getWorkersDevSubdomain(
				complianceConfig,
				account.accountId,
				undefined,
				apiToken
			);
			host = `${name ?? crypto.randomUUID()}.${subdomain}`;
		}
		return {
			value: previewSessionToken,
			host: host,
			name,
		};
	} catch (e) {
		if (!(e instanceof ParseError)) {
			throw e;
		} else {
			throw new UserError(
				`Could not create remote preview session on ${
					ctx.zone
						? ` host \`${ctx.host}\` on zone \`${ctx.zone}\``
						: `your account`
				}.`
			);
		}
	}
}

/**
 * Creates a preview token.
 */
async function createPreviewToken(
	complianceConfig: ComplianceConfig,
	account: CfAccount,
	worker: CfWorkerInitWithName,
	ctx: CfWorkerContext,
	session: CfPreviewSession,
	abortSignal: AbortSignal,
	minimal_mode?: boolean
): Promise<CfPreviewToken> {
	const { value, host } = session;
	const { accountId } = account;
	const url =
		ctx.env && ctx.useServiceEnvironments
			? `/accounts/${accountId}/workers/services/${worker.name}/environments/${ctx.env}/edge-preview`
			: `/accounts/${accountId}/workers/scripts/${worker.name}/edge-preview`;

	const mode: CfPreviewMode = ctx.zone
		? {
				routes:
					ctx.routes && ctx.routes.length > 0
						? // extract all the route patterns
							ctx.routes.map((route) => {
								if (typeof route === "string") {
									return route;
								}
								if (route.custom_domain) {
									return `${route.pattern}/*`;
								}
								return route.pattern;
							})
						: // if there aren't any patterns, then just match on all routes
							["*/*"],
				minimal_mode,
			}
		: { workers_dev: true, minimal_mode };

	const formData = createWorkerUploadForm(worker, worker.bindings);
	formData.set("wrangler-session-config", JSON.stringify(mode));

	const { preview_token, tail_url } = await fetchResult<{
		preview_token: string;
		tail_url: string;
	}>(
		complianceConfig,
		url,
		{
			method: "POST",
			body: formData,
			headers: {
				"cf-preview-upload-config-token": value,
			},
		},
		undefined,
		abortSignal
	);

	return {
		value: preview_token,
		host,
		tailUrl: tail_url,
	};
}

/**
 * A stub to create a Cloudflare Worker preview.
 *
 * @example
 * const {value, host} = await createWorker(init, acct);
 */
export async function createWorkerPreview(
	complianceConfig: ComplianceConfig,
	init: CfWorkerInitWithName,
	account: CfAccount,
	ctx: CfWorkerContext,
	session: CfPreviewSession,
	abortSignal: AbortSignal,
	minimal_mode?: boolean
): Promise<CfPreviewToken> {
	const token = await createPreviewToken(
		complianceConfig,
		account,
		init,
		ctx,
		session,
		abortSignal,
		minimal_mode
	);

	return token;
}
