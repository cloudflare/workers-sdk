import { spawnSync } from "node:child_process";
import { UserError } from "@cloudflare/workers-utils";
import { fetch } from "undici";
import {
	getAccessClientIdFromEnv,
	getAccessClientSecretFromEnv,
	getAuthDomainFromEnv,
	getCfAuthorizationTokenFromEnv,
} from "./env-vars";
import type { OAuthFlowLogger } from "./context";

const headersCache: Record<string, Record<string, string>> = {};

const usesAccessCache = new Map<string, boolean>();

/**
 * Clear internal caches. Exported for use in tests only.
 */
export function clearAccessCaches(): void {
	for (const key of Object.keys(headersCache)) {
		delete headersCache[key];
	}
	usesAccessCache.clear();
}

/**
 * Probe a domain to detect whether it is sitting behind Cloudflare Access.
 *
 * A 302 to `cloudflareaccess.com` is the canonical signal. Service-auth-only
 * Access applications return a hard 403 instead and are therefore not detected
 * here — see {@link getAccessHeaders} for how this is handled.
 */
export async function domainUsesAccess(
	domain: string,
	logger: OAuthFlowLogger
): Promise<boolean> {
	logger.debug("Checking if domain has Access enabled:", domain);

	if (usesAccessCache.has(domain)) {
		logger.debug(
			"Using cached Access switch for:",
			domain,
			usesAccessCache.get(domain)
		);
		return usesAccessCache.get(domain) ?? false;
	}
	logger.debug("Access switch not cached for:", domain);
	try {
		const controller = new AbortController();
		const cancel = setTimeout(() => {
			controller.abort();
		}, 1000);

		const output = await fetch(`https://${domain}`, {
			redirect: "manual",
			signal: controller.signal,
		});
		clearTimeout(cancel);
		const usesAccess = !!(
			output.status === 302 &&
			output.headers.get("location")?.includes("cloudflareaccess.com")
		);
		logger.debug("Caching access switch for:", domain);

		usesAccessCache.set(domain, usesAccess);
		return usesAccess;
	} catch {
		usesAccessCache.set(domain, false);
		return false;
	}
}

/**
 * Get the headers needed to authenticate with an Access-protected domain.
 *
 * @param domain The hostname of the Access-protected domain (e.g. `"example.com"`).
 * @param options logger + an `isNonInteractiveOrCI` predicate used to
 *   produce an actionable error in CI; both default to no-op / `false`.
 * @returns
 * - Service token headers (`CF-Access-Client-Id` + `CF-Access-Client-Secret`) if env vars are set
 * - A `Cookie: CF_Authorization=...` header if obtained via `cloudflared` (interactive only)
 * - An empty object if the domain is not behind Access
 * @throws {UserError} If the response does not contain a `CF_Authorization` cookie,
 *   indicating the service token is invalid, expired, or lacks a Service Auth policy.
 *   Also throws in non-interactive environments when the domain is behind Access
 *   but no service token credentials are configured.
 */
export async function getAccessHeaders(
	domain: string,
	options: {
		logger: OAuthFlowLogger;
		isNonInteractiveOrCI: () => boolean;
	}
): Promise<Record<string, string>> {
	const logger = options.logger;
	const isNonInteractiveOrCI = options.isNonInteractiveOrCI;

	// 1. If Access Service Token credentials are provided, use them directly.
	//
	// This check intentionally comes before `domainUsesAccess()`, which detects
	// Access by looking for a 302 redirect to `cloudflareaccess.com`. When an
	// Access application is configured to only allow Service Auth tokens (no
	// interactive user authentication), the domain responds with a hard 403
	// instead of redirecting, so `domainUsesAccess()` returns false. If we
	// gated the env var check on `domainUsesAccess()` we would never attach
	// the service token headers and the request would fail with a 403.
	const clientId = getAccessClientIdFromEnv();
	const clientSecret = getAccessClientSecretFromEnv();

	if (clientId && clientSecret) {
		logger.debug("Using Access Service Token headers for domain:", domain);
		const headers = {
			"CF-Access-Client-Id": clientId,
			"CF-Access-Client-Secret": clientSecret,
		};
		headersCache[domain] = headers;
		return headers;
	}

	// Warn if only one of the two env vars is set
	if (clientId !== undefined || clientSecret !== undefined) {
		logger.warn(
			"Both CLOUDFLARE_ACCESS_CLIENT_ID and CLOUDFLARE_ACCESS_CLIENT_SECRET must be set to use Access Service Token authentication. " +
				`Only ${
					clientId !== undefined
						? "CLOUDFLARE_ACCESS_CLIENT_ID"
						: "CLOUDFLARE_ACCESS_CLIENT_SECRET"
				} was found.`
		);
	}

	if (!(await domainUsesAccess(domain, logger))) {
		return {};
	}
	logger.debug("Getting Access headers for domain:", domain);
	if (headersCache[domain]) {
		logger.debug("Using cached Access headers for domain:", domain);
		return headersCache[domain];
	}

	// 2. If non-interactive (CI), error with actionable message
	if (isNonInteractiveOrCI()) {
		throw new UserError(
			`The domain "${domain}" is behind Cloudflare Access, but no Access Service Token credentials were found ` +
				`and the current environment is non-interactive.\n` +
				`Set the CLOUDFLARE_ACCESS_CLIENT_ID and CLOUDFLARE_ACCESS_CLIENT_SECRET environment variables ` +
				`to authenticate with an Access Service Token.\n` +
				`See https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/`,
			{
				telemetryMessage: "user access missing service token non interactive",
			}
		);
	}

	// 3. Interactive: fall back to cloudflared
	logger.debug("Spawning cloudflared to get Access token for domain:");
	const output = spawnSync("cloudflared", ["access", "login", domain]);
	if (output.error) {
		throw new UserError(
			"To use Wrangler with Cloudflare Access, please install `cloudflared` from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation",
			{ telemetryMessage: "user access missing cloudflared" }
		);
	}
	const stringOutput = output.stdout.toString();
	logger.debug("cloudflared output:", stringOutput);
	const matches = stringOutput.match(/fetched your token:\n\n(.*)/m);
	if (matches && matches.length >= 2) {
		const headers = { Cookie: `CF_Authorization=${matches[1]}` };
		headersCache[domain] = headers;
		logger.debug("Caching Access headers for domain:", domain);
		return headers;
	}
	throw new Error("Failed to authenticate with Cloudflare Access");
}

/**
 * Get headers needed to authenticate with the Cloudflare OAuth auth domain
 * (the OAuth `WRANGLER_AUTH_DOMAIN`, which is `dash.cloudflare.com` by default
 * and `dash.staging.cloudflare.com` in staging).
 *
 * Checks `WRANGLER_CF_AUTHORIZATION_TOKEN` first, then falls back to
 * {@link getAccessHeaders} against the configured auth domain.
 */
export async function getCloudflareAccessHeaders(options: {
	logger: OAuthFlowLogger;
	isNonInteractiveOrCI: () => boolean;
}): Promise<Record<string, string>> {
	const cfAuthToken = getCfAuthorizationTokenFromEnv();

	// If the environment variable is defined, go ahead and use it.
	if (cfAuthToken !== undefined) {
		// Don't include the token value in the log — if debug logging is enabled
		// and logs are persisted, the raw token would leak as a credential.
		options.logger.debug(
			"Using WRANGLER_CF_AUTHORIZATION_TOKEN from environment"
		);
		return { Cookie: `CF_Authorization=${cfAuthToken}` };
	}

	return getAccessHeaders(getAuthDomainFromEnv(), options);
}
