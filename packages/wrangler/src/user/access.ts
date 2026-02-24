import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { UserError } from "@cloudflare/workers-utils";
import { fetch } from "undici";
import { logger } from "../logger";

const execFileAsync = promisify(execFile);

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
	domain: string,
	signal?: AbortSignal
): Promise<string | undefined> {
	if (!(await domainUsesAccess(domain))) {
		return undefined;
	}
	logger.debug("Fetching Access token for domain:", domain);
	if (cache[domain]) {
		logger.debug("Using cached Access token for domain:", cache[domain]);
		return cache[domain];
	}
	logger.log(
		"Cloudflare Access is enabled for this domain. Launching cloudflared to authenticate..."
	);
	logger.debug("Spawning cloudflared to get Access token for domain:");

	const timeoutSignal = AbortSignal.timeout(60_000);
	const combinedSignal = signal
		? AbortSignal.any([timeoutSignal, signal])
		: timeoutSignal;

	let stringOutput: string;

	try {
		const { stdout } = await execFileAsync(
			"cloudflared",
			["access", "login", domain],
			{
				signal: combinedSignal,
			}
		);
		stringOutput = stdout;
	} catch (err) {
		if (
			err instanceof Error &&
			"code" in err &&
			(err as Error & { code: string }).code === "ENOENT"
		) {
			throw new UserError(
				"To use Wrangler with Cloudflare Access, please install `cloudflared` from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation"
			);
		}

		if (
			err instanceof Error &&
			err.name === "AbortError" &&
			timeoutSignal.aborted
		) {
			throw new UserError(
				"Cloudflare Access authentication timed out after 60 seconds. Please try again."
			);
		}

		throw err;
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
