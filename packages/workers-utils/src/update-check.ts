import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as timersPromises from "node:timers/promises";
import { fetch } from "undici";

// Safety-net timeout for the update check. The registry request is aborted
// after this long, and the whole operation (cache I/O included) is raced
// against the same budget so that a slow disk cannot hold up the caller.
const UPDATE_CHECK_TIMEOUT_MS = 3_000;

// How long a registry lookup is reused before asking npm again.
const CACHE_TTL_MS = 60 * 60 * 1_000;

const NPM_REGISTRY_URL = "https://registry.npmjs.org/";

// Sentinel value used to distinguish a timeout from "nothing to recommend".
const TIMED_OUT: unique symbol = Symbol("timed_out");

export type NpmVersionCheckResult =
	| { status: "up-to-date" }
	| { status: "update-available"; latest: string }
	| { status: "failed" };

/**
 * The subset of npm's abbreviated packument
 * (`application/vnd.npm.install-v1+json`) that the update check reads.
 */
interface AbbreviatedPackument {
	"dist-tags": Record<string, string>;
	versions: Record<string, { deprecated?: string }>;
}

interface UpdateCheckCache {
	/** The version to recommend, or `null` when there is none. */
	latest: string | null;
	/** Epoch milliseconds of the registry lookup that produced `latest`. */
	lastUpdate: number;
}

/**
 * Checks if a newer version of a package is available on npm.
 *
 * Queries the npm registry for the version behind the relevant dist tag —
 * "beta" for pre-release versions (0.0.0-*) and "latest" for stable versions.
 * Deprecated releases are never recommended: if the tagged version has been
 * deprecated, the newest non-deprecated stable release below it is suggested
 * instead (or nothing, if there isn't one). The registry lookup is cached on
 * disk for an hour.
 *
 * @param name - The npm package name to check
 * @param version - The current version to compare against
 * @returns A discriminated result:
 *   - `{ status: "update-available", latest: string }` if a newer version exists
 *   - `{ status: "up-to-date" }` if the installed version is already the latest
 *   - `{ status: "failed" }` if the check could not be completed (network error, timeout, etc.)
 */
export async function fetchLatestNpmVersion(
	name: string,
	version: string
): Promise<NpmVersionCheckResult> {
	const distTag = version.startsWith("0.0.0") ? "beta" : "latest";

	let latest: string | null | typeof TIMED_OUT;
	try {
		latest = await Promise.race([
			getLatestVersion(name, distTag),
			timersPromises.setTimeout(UPDATE_CHECK_TIMEOUT_MS, TIMED_OUT, {
				ref: false,
			}),
		]);
	} catch {
		return { status: "failed" };
	}

	if (latest === TIMED_OUT) {
		return { status: "failed" };
	}
	if (latest === null || compareVersions(version, latest) >= 0) {
		return { status: "up-to-date" };
	}
	return { status: "update-available", latest };
}

/**
 * Resolve the version to recommend for `distTag`, reusing a cached answer
 * when it is less than an hour old.
 */
async function getLatestVersion(
	name: string,
	distTag: string
): Promise<string | null> {
	const cacheFile = getCacheFile(name, distTag);
	const now = Date.now();

	const cached = await readCache(cacheFile);
	if (cached !== null && cached.lastUpdate + CACHE_TTL_MS > now) {
		return cached.latest;
	}

	const latest = pickLatestVersion(await fetchPackument(name), distTag);
	await writeCache(cacheFile, { latest, lastUpdate: now });
	return latest;
}

/**
 * Pick the version to recommend from a packument.
 *
 * @returns The version behind `distTag`, unless it has been deprecated, in
 *   which case the newest non-deprecated stable release below it — or `null`
 *   when there is nothing suitable to recommend.
 */
function pickLatestVersion(
	packument: AbbreviatedPackument,
	distTag: string
): string | null {
	const tagged = packument["dist-tags"][distTag];
	if (tagged === undefined) {
		throw new Error(`Distribution tag ${distTag} is not available`);
	}
	if (!packument.versions[tagged]?.deprecated) {
		return tagged;
	}

	// The tagged release has been deprecated — typically because it shipped a
	// bug that was only found after publishing — so recommending it would
	// point users at a known-bad version. Fall back to the newest stable
	// release below it that has not been deprecated. Pre-releases (such as
	// the `beta` dist tag's `0.0.0-<sha>` builds) cannot be meaningfully
	// ordered, so nothing is recommended for them.
	if (distTag !== "latest") {
		return null;
	}
	const candidates = Object.entries(packument.versions)
		.filter(
			([candidate, meta]) =>
				!meta.deprecated &&
				!candidate.includes("-") &&
				compareVersions(candidate, tagged) < 0
		)
		.map(([candidate]) => candidate)
		.sort(compareVersions);
	return candidates.at(-1) ?? null;
}

async function fetchPackument(name: string): Promise<AbbreviatedPackument> {
	const packageUrl = new URL(
		encodeURIComponent(name).replace(/^%40/, "@"),
		NPM_REGISTRY_URL
	);
	const response = await fetch(packageUrl, {
		headers: {
			accept:
				"application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*",
		},
		signal: AbortSignal.timeout(UPDATE_CHECK_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(`Request failed with code ${response.status}`);
	}
	return (await response.json()) as AbbreviatedPackument;
}

function getCacheFile(name: string, distTag: string): string {
	// Same location and naming scheme as the `update-check` package this
	// replaced, so caches written by earlier versions carry on being honoured.
	return path.join(
		tmpdir(),
		"update-check",
		`${name.replace("/", "-")}-${distTag}.json`
	);
}

async function readCache(file: string): Promise<UpdateCheckCache | null> {
	try {
		const parsed = JSON.parse(
			await readFile(file, "utf8")
		) as Partial<UpdateCheckCache>;
		if (
			typeof parsed.lastUpdate === "number" &&
			(typeof parsed.latest === "string" || parsed.latest === null)
		) {
			return { latest: parsed.latest, lastUpdate: parsed.lastUpdate };
		}
	} catch {
		// A missing or unreadable cache file simply means we have to ask npm.
	}
	return null;
}

async function writeCache(file: string, cache: UpdateCheckCache) {
	// The cache is only an optimisation; failing to persist it must not turn
	// a successful check into a failure.
	try {
		await mkdir(path.dirname(file), { recursive: true });
		await writeFile(file, JSON.stringify(cache), "utf8");
	} catch {
		// Ignore write failures (read-only or full temp directory, etc.).
	}
}

function compareVersions(a: string, b: string): number {
	return a.localeCompare(b, "en-US", { numeric: true });
}
