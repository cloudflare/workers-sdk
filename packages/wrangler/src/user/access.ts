import { spawnSync } from "node:child_process";
import { UserError } from "@cloudflare/workers-utils";
import { fetch } from "undici";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import {
	getAccessClientIdFromEnv,
	getAccessClientSecretFromEnv,
} from "./auth-variables";

const headersCache: Record<string, Record<string, string>> = {};

const usesAccessCache = new Map();

/**
 * Clear internal caches. Exported for use in tests only.
 */
export function clearAccessCaches(): void {
	for (const key of Object.keys(headersCache)) {
		delete headersCache[key];
	}
	usesAccessCache.clear();
}

export async function domainUsesAccess(domain: string): Promise<boolean> {
	logger.debug("Checking if domain has Access enabled:", domain);

	if (usesAccessCache.has(domain)) {
		logger.debug(
			"Using cached Access switch for:",
			domain,
			usesAccessCache.get(domain)
		);
		return usesAccessCache.get(domain);
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
	domain: string
): Promise<Record<string, string>> {
	if (!(await domainUsesAccess(domain))) {
		return {};
	}
	logger.debug("Getting Access headers for domain:", domain);
	if (headersCache[domain]) {
		logger.debug("Using cached Access headers for domain:", domain);
		return headersCache[domain];
	}

	// 1. If Access Service Token credentials are provided, use them directly
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

	// 2. If non-interactive (CI), error with actionable message
	if (isNonInteractiveOrCI()) {
		throw new UserError(
			`The domain "${domain}" is behind Cloudflare Access, but no Access Service Token credentials were found ` +
				`and the current environment is non-interactive.\n` +
				`Set the CLOUDFLARE_ACCESS_CLIENT_ID and CLOUDFLARE_ACCESS_CLIENT_SECRET environment variables ` +
				`to authenticate with an Access Service Token.\n` +
				`See https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/`
		);
	}

	// 3. Interactive: fall back to cloudflared
	logger.debug("Spawning cloudflared to get Access token for domain:");
	const output = spawnSync("cloudflared", ["access", "login", domain]);
	if (output.error) {
		throw new UserError(
			"To use Wrangler with Cloudflare Access, please install `cloudflared` from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation"
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
