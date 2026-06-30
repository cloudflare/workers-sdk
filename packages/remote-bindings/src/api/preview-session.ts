import crypto from "node:crypto";
import { getAccessHeaders } from "@cloudflare/workers-auth";
import { fetch } from "undici";
import { fetchResult } from "./fetch";
import { getWorkersDevSubdomain } from "./subdomain";
import type { Logger } from "../logger";
import type { AuthCredentials, PreviewSession } from "../types";

/**
 * Try to exchange a session token via the exchange URL.
 *
 * The edge-preview API may return an `exchange_url` alongside the session
 * token. When present, we must fetch it to get a re-encoded token. This
 * handles various edge configurations (including Cloudflare Access-protected
 * preview domains).
 *
 * Returns null if the exchange fails for any reason — the caller should
 * fall back to the raw token.
 */
async function tryExchangeToken(
	exchangeUrl: string,
	logger: Logger,
	abortSignal?: AbortSignal
): Promise<string | null> {
	try {
		const url = new URL(exchangeUrl);

		// Attach Cloudflare Access headers when the exchange domain is
		// Access-protected (e.g. staging). Resolved via `@cloudflare/workers-auth`
		// so the same Access handling is shared with wrangler.
		const headers = await getAccessHeaders(url.hostname, {
			logger,
			isNonInteractiveOrCI: () => true,
		});

		const response = await fetch(url, {
			signal: abortSignal,
			headers,
		});

		if (!response.ok) {
			return null;
		}

		const body = (await response.json()) as { token?: string };
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
 * Create an edge-preview session. This is the first of two API calls needed
 * to set up a remote preview — it creates a session token that's used when
 * uploading the worker.
 *
 * If the API returns an `exchange_url`, we perform the token exchange to get
 * a re-encoded token. Falls back to the raw token if exchange fails.
 */
export async function createPreviewSession(
	auth: AuthCredentials,
	name: string | undefined,
	complianceRegion: string | undefined,
	logger: Logger,
	abortSignal?: AbortSignal
): Promise<PreviewSession> {
	const initUrl = `/accounts/${auth.accountId}/workers/subdomain/edge-preview`;

	const { token, exchange_url } = await fetchResult<{
		token: string;
		exchange_url?: string;
	}>(auth, initUrl, undefined, complianceRegion, logger, abortSignal);

	// Exchange the token if the API tells us to
	const sessionToken = exchange_url
		? ((await tryExchangeToken(exchange_url, logger, abortSignal)) ?? token)
		: token;

	const subdomain = await getWorkersDevSubdomain(
		auth,
		complianceRegion,
		logger
	);
	const host = `${name ?? crypto.randomUUID()}.${subdomain}`;

	return {
		value: sessionToken,
		host,
		name,
	};
}
