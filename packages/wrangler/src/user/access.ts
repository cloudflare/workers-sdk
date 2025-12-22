import { spawnSync } from "node:child_process";
import {
	getEnvironmentVariableFactory,
	UserError,
} from "@cloudflare/workers-utils";
import { fetch } from "undici";
import { logger } from "../logger";

/**
 * Headers to authenticate with Cloudflare Access.
 * Either a CF_Authorization cookie (from cloudflared) or service token headers.
 */
export type AccessHeaders = Record<string, string>;

/**
 * `CLOUDFLARE_ACCESS_CLIENT_ID` is the Client ID for a Cloudflare Access Service Token.
 * Use this with `CLOUDFLARE_ACCESS_CLIENT_SECRET` for machine-to-machine authentication
 * in CI/CD environments where interactive browser authentication is not possible.
 */
const getAccessClientIdFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_ACCESS_CLIENT_ID",
});

/**
 * `CLOUDFLARE_ACCESS_CLIENT_SECRET` is the Client Secret for a Cloudflare Access Service Token.
 * Use this with `CLOUDFLARE_ACCESS_CLIENT_ID` for machine-to-machine authentication
 * in CI/CD environments where interactive browser authentication is not possible.
 */
const getAccessClientSecretFromEnv = getEnvironmentVariableFactory({
	variableName: "CLOUDFLARE_ACCESS_CLIENT_SECRET",
});

const cache: Record<string, string> = {};

const usesAccessCache = new Map();

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
export async function getAccessToken(
	domain: string
): Promise<string | undefined> {
	if (!(await domainUsesAccess(domain))) {
		return undefined;
	}
	logger.debug("Fetching Access token for domain:", domain);
	if (cache[domain]) {
		logger.debug("Using cached Access token for domain:", cache[domain]);
		return cache[domain];
	}
	logger.debug("Spawning cloudflared to get Access token for domain:");
	const output = spawnSync("cloudflared", ["access", "login", domain], {
		stdio: ["inherit", "pipe", "inherit"],
	});
	if (output.error) {
		// The cloudflared binary is not installed
		throw new UserError(
			"To use Wrangler with Cloudflare Access, please install `cloudflared` from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation"
		);
	}
	const stringOutput = output.stdout.toString();
	const stringErrorOutput = output.stderr.toString();
	// Print cloudflared output so users can see the authentication URL
	if (stringOutput) {
		logger.log(stringOutput);
	}
	if (stringErrorOutput) {
		logger.error(stringErrorOutput);
	}
	logger.debug("cloudflared output:", stringOutput);
	const matches = stringOutput.match(/fetched your token:\n\n(.*)/m);
	if (matches && matches.length >= 2) {
		cache[domain] = matches[1];
		logger.debug("Caching Access token for domain:", matches[1]);
		return matches[1];
	}
	throw new Error("Failed to authenticate with Cloudflare Access");
}

/**
 * Get headers for authenticating with Cloudflare Access.
 *
 *
 * @param domain - The domain to authenticate against
 * @returns Headers object to include in requests, or undefined if domain doesn't use Access
 */
export async function getAccessHeaders(
	domain: string
): Promise<AccessHeaders | undefined> {
	if (!(await domainUsesAccess(domain))) {
		return undefined;
	}

	// Check for service token credentials first (preferred for CI/CD)
	const clientId = getAccessClientIdFromEnv();
	const clientSecret = getAccessClientSecretFromEnv();

	if (clientId && clientSecret) {
		logger.debug(
			"Using Cloudflare Access service token from environment variables"
		);
		return {
			"CF-Access-Client-Id": clientId,
			"CF-Access-Client-Secret": clientSecret,
		};
	}

	if (clientId || clientSecret) {
		logger.warn(
			"Both CLOUDFLARE_ACCESS_CLIENT_ID and CLOUDFLARE_ACCESS_CLIENT_SECRET must be set to use service tokens. Falling back to cloudflared."
		);
	}

	const token = await getAccessToken(domain);
	if (token) {
		return {
			Cookie: `CF_Authorization=${token}`,
		};
	}

	return undefined;
}
