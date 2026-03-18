import { spawnSync } from "node:child_process";
import { fetch } from "undici";
import { UserError } from "./errors";

/**
 * Minimal logger interface for debug output.
 * Pass wrangler's `logger`, `console`, or omit for silent operation.
 */
export interface AccessLogger {
	debug(...args: unknown[]): void;
}

const noopLogger: AccessLogger = { debug() {} };

const cache: Record<string, string> = {};

const usesAccessCache = new Map<string, boolean>();

export async function domainUsesAccess(
	domain: string,
	logger: AccessLogger = noopLogger
): Promise<boolean> {
	logger.debug("Checking if domain has Access enabled:", domain);

	if (usesAccessCache.has(domain)) {
		const cached = usesAccessCache.get(domain);
		logger.debug("Using cached Access switch for:", domain, cached);
		return cached ?? false;
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
	domain: string,
	logger: AccessLogger = noopLogger
): Promise<string | undefined> {
	if (!(await domainUsesAccess(domain, logger))) {
		return undefined;
	}
	logger.debug("Fetching Access token for domain:", domain);
	if (cache[domain]) {
		logger.debug("Using cached Access token for domain:", cache[domain]);
		return cache[domain];
	}
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
	if (matches && matches[1] !== undefined) {
		cache[domain] = matches[1];
		logger.debug("Caching Access token for domain:", matches[1]);
		return matches[1];
	}
	throw new Error("Failed to authenticate with Cloudflare Access");
}
