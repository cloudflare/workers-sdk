import assert from "node:assert";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { dim } from "kleur/colors";
import { fetch } from "undici";
import { Plugins } from "./plugins";
import { Log, OptionalZodTypeOf } from "./shared";
import type { IncomingRequestCfProperties } from "@cloudflare/workers-types/experimental";

/**
 * Gets the default path for the cf.json cache file.
 * Respects WRANGLER_CACHE_DIR and WRANGLER_HOME environment variables,
 * and automatically detects Yarn PnP projects.
 */
function getDefaultCfPath(): string {
	// Check for WRANGLER_CACHE_DIR environment variable
	const wranglerCacheDir = process.env.WRANGLER_CACHE_DIR;
	if (wranglerCacheDir) {
		return path.resolve(wranglerCacheDir, "cf.json");
	}

	// Check for WRANGLER_HOME environment variable
	const wranglerHome = process.env.WRANGLER_HOME;
	if (wranglerHome) {
		return path.resolve(wranglerHome, "cache", "cf.json");
	}

	// Check for Yarn PnP
	const pnpExists = existsSync(".pnp.cjs") || existsSync(".pnp.js");
	if (pnpExists) {
		return path.resolve(".wrangler", "cache", "cf.json");
	}

	// Default to node_modules/.mf
	return path.resolve("node_modules", ".mf", "cf.json");
}

const defaultCfPath = getDefaultCfPath();
const defaultCfFetchEndpoint = "https://workers.cloudflare.com/cf.json";

// Environment variable names for controlling cf fetch behavior
const CF_FETCH_ENABLED_ENV_VAR = "CLOUDFLARE_CF_FETCH_ENABLED";
const CF_FETCH_PATH_ENV_VAR = "CLOUDFLARE_CF_FETCH_PATH";

export const fallbackCf: IncomingRequestCfProperties = {
	asOrganization: "",
	asn: 395747,
	colo: "DFW",
	city: "Austin",
	region: "Texas",
	regionCode: "TX",
	metroCode: "635",
	postalCode: "78701",
	country: "US",
	continent: "NA",
	timezone: "America/Chicago",
	latitude: "30.27130",
	longitude: "-97.74260",
	clientTcpRtt: 0,
	httpProtocol: "HTTP/1.1",
	requestPriority: "weight=192;exclusive=0",
	tlsCipher: "AEAD-AES128-GCM-SHA256",
	tlsVersion: "TLSv1.3",
	tlsClientAuth: {
		certPresented: "0",
		certVerified: "NONE",
		certRevoked: "0",
		certIssuerDN: "",
		certSubjectDN: "",
		certIssuerDNRFC2253: "",
		certSubjectDNRFC2253: "",
		certIssuerDNLegacy: "",
		certSubjectDNLegacy: "",
		certSerial: "",
		certIssuerSerial: "",
		certSKI: "",
		certIssuerSKI: "",
		certFingerprintSHA1: "",
		certFingerprintSHA256: "",
		certNotBefore: "",
		certNotAfter: "",
	},
	edgeRequestKeepAliveStatus: 0,
	hostMetadata: undefined,
	clientTrustScore: 99,
	botManagement: {
		corporateProxy: false,
		verifiedBot: false,
		ja3Hash: "25b4882c2bcb50cd6b469ff28c596742",
		staticResource: false,
		detectionIds: [],
		score: 99,
	},
};
// Milliseconds in 1 day
export const DAY = 86400000;
// Max age in days of cf.json
export const CF_DAYS = 30;

type CoreOptions = OptionalZodTypeOf<Plugins["core"]["sharedOptions"]>;

/**
 * Check if cf fetching is disabled via environment variable.
 *
 * Returns true if CLOUDFLARE_CF_FETCH_ENABLED is set to "false".
 */
function isCfFetchDisabledByEnv(): boolean {
	const envValue = process.env[CF_FETCH_ENABLED_ENV_VAR];
	if (envValue === undefined) {
		return false;
	}
	return envValue.toLowerCase() === "false";
}

/**
 * Get custom cf.json path from environment variable.
 *
 * Returns the path if CLOUDFLARE_CF_FETCH_PATH is set and non-empty, otherwise undefined.
 */
function getCfPathFromEnv(): string | undefined {
	const envValue = process.env[CF_FETCH_PATH_ENV_VAR];
	// Treat empty string as unset (use default path)
	if (envValue === undefined || envValue === "") {
		return undefined;
	}
	return envValue;
}

/**
 * Get the cf option value, considering environment variable overrides.
 *
 * Priority:
 * 1. If `cf` option is explicitly provided (not undefined), use it
 * 2. Check CLOUDFLARE_CF_FETCH_ENABLED environment variable:
 *    - "false" -> return false (disable fetching)
 * 3. Check CLOUDFLARE_CF_FETCH_PATH environment variable:
 *    - If set, use as custom path for cf.json cache
 * 4. Return undefined to use default behavior
 */
function getCfOptionWithEnvOverride(cf: CoreOptions["cf"]): CoreOptions["cf"] {
	// If cf option is explicitly provided, use it
	if (cf !== undefined) {
		return cf;
	}

	// Check if fetching is disabled
	if (isCfFetchDisabledByEnv()) {
		return false;
	}

	// Check for custom path
	const customPath = getCfPathFromEnv();
	if (customPath !== undefined) {
		return customPath;
	}

	return undefined;
}

export async function setupCf(
	log: Log,
	cf: CoreOptions["cf"]
): Promise<Record<string, unknown>> {
	// Apply environment variable override
	const effectiveCf = getCfOptionWithEnvOverride(cf);

	if (!(effectiveCf ?? process.env.NODE_ENV !== "test")) {
		return fallbackCf;
	}

	if (typeof effectiveCf === "object") {
		return effectiveCf;
	}

	let cfPath = defaultCfPath;
	if (typeof effectiveCf === "string") {
		cfPath = effectiveCf;
	}

	// Try load cfPath, if this fails, we'll catch the error and refetch.
	// If this succeeds, and the file is stale, that's fine: it's very likely
	// we'll be fetching the same data anyways.
	try {
		const storedCf = JSON.parse(await readFile(cfPath, "utf8"));
		const cfStat = await stat(cfPath);
		assert(Date.now() - cfStat.mtimeMs <= CF_DAYS * DAY);
		return storedCf;
	} catch {}

	try {
		const res = await fetch(defaultCfFetchEndpoint);
		const cfText = await res.text();
		const storedCf = JSON.parse(cfText);
		// Write cf so we can reuse it later
		await mkdir(path.dirname(cfPath), { recursive: true });
		await writeFile(cfPath, cfText, "utf8");
		log.debug("Updated `Request.cf` object cache!");
		return storedCf;
	} catch (e: any) {
		log.warn(
			"Unable to fetch the `Request.cf` object! Falling back to a default placeholder...\n" +
				dim(e.cause ? e.cause.stack : e.stack)
		);
		return fallbackCf;
	}
}
