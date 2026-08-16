import fs from "node:fs";
import path from "node:path";
import {
	getGlobalWranglerCachePath,
	removeDir,
} from "@cloudflare/workers-utils";
import {
	Browser,
	detectBrowserPlatform,
	install,
	resolveBuildId,
} from "@puppeteer/browsers";
import type { Log } from "../../shared";
import type { InstalledBrowser, InstallOptions } from "@puppeteer/browsers";

type InstallLog = Pick<Log, "warn" | "debug">;

/**
 * Marker written into a Chrome installation directory once Chrome has
 * actually launched from it.
 *
 * Deliberately *not* written when `install()` resolves. `install()` treats an
 * installation as present if the directory exists and contains the
 * executable, which is not enough: the Chrome-for-Testing archives extract
 * alphabetically, so `chrome.exe` lands well before `resources.pak`. An
 * install interrupted part-way therefore satisfies `install()` while
 * producing a Chrome that exits with
 * `ERROR:resource_bundle.cc] Failed to load ...\resources.pak` on launch.
 *
 * Keying the marker on a successful launch instead means it answers the only
 * question worth asking — "is this install known to work?" — and cannot be
 * fooled by a directory that merely looks plausible.
 */
const INSTALL_COMPLETE_MARKER = ".miniflare-install-complete";

/**
 * Coordination for the Chrome installation shared by everything in this
 * process, keyed by installation directory.
 *
 * Deliberately module scope. What is being coordinated is a single directory
 * under the global Wrangler cache, which is shared by every `Miniflare`
 * instance here — and indeed by every process on the machine. Narrowing this
 * to one instance would reintroduce exactly the races it exists to prevent:
 * two instances racing to populate the same directory, or one deleting an
 * install another is running Chrome from.
 *
 * Bounded by the number of distinct Chrome versions used, which is one.
 */
const installs = {
	/**
	 * In-flight installs. Without this, two overlapping
	 * `ensureBrowserInstalled()` calls both reach `install()`; the second sees
	 * the first's partially-extracted directory, short-circuits, and hands back
	 * a path to a Chrome that cannot launch. That is the common shape in tests,
	 * where a timed-out test abandons its install but the download keeps running
	 * in the background and the next test starts immediately.
	 */
	inFlight: new Map<string, Promise<InstalledBrowser>>(),

	/**
	 * Installation directories Chrome has launched from during this process.
	 *
	 * A directory is added synchronously on a successful launch, ahead of the
	 * on-disk marker, which is written asynchronously and best-effort. Launches
	 * run concurrently — one per session acquire — so without this there is a
	 * window in which one session has a working Chrome running while another,
	 * having just failed, still sees no marker and would delete the directory
	 * out from under it.
	 */
	verifiedDirs: new Set<string>(),

	/**
	 * Bumped whenever an installation is discarded, so that concurrent launches
	 * can tell "nobody has dealt with this yet" from "a peer already replaced it
	 * while I was failing".
	 */
	generations: new Map<string, number>(),

	/** Serialises recovery per installation directory. */
	locks: new Map<string, Promise<unknown>>(),
};

function withInstallLock<T>(
	installDir: string,
	fn: () => Promise<T>
): Promise<T> {
	const previous = installs.locks.get(installDir) ?? Promise.resolve();
	// Swallow the predecessor's rejection: we only need its completion, and it
	// is reported to whoever is awaiting it.
	const result = previous.catch(() => {}).then(fn);
	installs.locks.set(
		installDir,
		result.catch(() => {})
	);
	return result;
}

/**
 * Token identifying the state of an installation at the point a launch began,
 * so that {@link discardIncompleteInstall} can refuse to delete an
 * installation that has already been replaced since.
 */
function getInstallGeneration(installDir: string): number {
	return installs.generations.get(installDir) ?? 0;
}

/**
 * A resolved Chrome installation, and the two things a caller can report back
 * about it once it has tried to launch.
 *
 * Both are methods on the installation rather than free functions because
 * they need the generation of the directory *this* caller was handed, which
 * has to be captured before the launch it is reporting on. See
 * {@link discardIncompleteInstall}.
 */
interface BrowserInstall {
	executablePath: string;
	/** Absolute path of the versioned installation directory. */
	installDir: string;
	/**
	 * Record that Chrome launched successfully from this installation, so that
	 * a later launch failure can be told apart from a broken download.
	 *
	 * Best-effort: losing the marker only costs a re-download in the unlikely
	 * event that Chrome stops starting.
	 */
	markVerified(): Promise<void>;
	/**
	 * Clear this installation because Chrome failed to start from it, unless
	 * there is positive evidence that it is fine.
	 */
	discard(): Promise<DiscardResult>;
}

/**
 * Resolve a fully-installed Chrome for the Browser Run binding, downloading
 * it into the global Wrangler cache if necessary.
 *
 * Concurrent calls for the same version share a single install.
 */
export async function ensureBrowserInstalled({
	browserVersion,
	log,
	onProgress,
}: {
	browserVersion: string;
	log: InstallLog;
	/** Invoked as the archive downloads. Not called when already installed. */
	onProgress?: (downloadedBytes: number, totalBytes: number) => void;
}): Promise<BrowserInstall> {
	const platform = detectBrowserPlatform();
	if (!platform) {
		throw new Error("The current platform is not supported.");
	}
	const browser = Browser.CHROME;
	const cacheDir = getGlobalWranglerCachePath();
	const buildId = await resolveBuildId(browser, platform, browserVersion);
	const installDir = getInstallDir(cacheDir, browser, platform, buildId);

	// Deliberately not annotated `InstallOptions`: `install()` is overloaded on
	// `unpack`, and only the `unpack?: true` form returns an `InstalledBrowser`.
	const installOptions = {
		browser,
		platform,
		cacheDir,
		buildId,
		downloadProgressCallback: onProgress,
	};

	const existing = installs.inFlight.get(installDir);
	if (existing) {
		log.debug(`Waiting for an in-progress Chrome install at ${installDir}`);
		return toBrowserInstall(await existing, installDir, log);
	}

	const pending = installWithCorruptedCacheRecovery(
		installOptions,
		log
	).finally(() => {
		installs.inFlight.delete(installDir);
	});
	installs.inFlight.set(installDir, pending);

	return toBrowserInstall(await pending, installDir, log);
}

function toBrowserInstall(
	installed: InstalledBrowser,
	installDir: string,
	log: InstallLog
): BrowserInstall {
	// Captured here, before the caller has had a chance to launch, so that if a
	// concurrent launch discards and replaces this installation while this
	// caller is failing, `discard()` can tell.
	const generation = getInstallGeneration(installDir);
	return {
		executablePath: installed.executablePath,
		installDir,
		markVerified: () => markInstallVerified(installDir, log),
		discard: () => discardIncompleteInstall(installDir, generation, log),
	};
}

/**
 * Whether Chrome is known to have launched from this installation before.
 *
 * A `false` result does not mean the install is broken — one predating the
 * marker, or simply never used, is usually fine — but it does mean we cannot
 * vouch for it, which is enough to justify re-installing if Chrome then fails
 * to launch. See {@link discardIncompleteInstall}.
 */
export function isInstallMarkedComplete(installDir: string): boolean {
	return fs.existsSync(path.join(installDir, INSTALL_COMPLETE_MARKER));
}

/**
 * Whether Chrome is known to have launched from this installation, either
 * earlier in this process or in a previous one.
 */
function isInstallVerified(installDir: string): boolean {
	return (
		installs.verifiedDirs.has(installDir) || isInstallMarkedComplete(installDir)
	);
}

/** Backs {@link BrowserInstall.markVerified}. */
async function markInstallVerified(
	installDir: string,
	log: InstallLog
): Promise<void> {
	// Before any `await`, so a concurrent launch that fails in the meantime
	// cannot conclude this installation is unproven.
	installs.verifiedDirs.add(installDir);
	if (isInstallMarkedComplete(installDir)) {
		return;
	}
	try {
		await fs.promises.writeFile(
			path.join(installDir, INSTALL_COMPLETE_MARKER),
			""
		);
	} catch (e) {
		log.debug(`Unable to mark the Chrome install as verified: ${e}`);
	}
}

/**
 * How long to keep retrying removal of a bad install.
 *
 * `removeDir` already retries briefly, but Windows can hold handles on a
 * just-crashed Chrome for longer than that — and giving up means the install
 * stays broken for every subsequent launch, so it is worth being patient.
 */
const DISCARD_TIMEOUT = 10_000;
const DISCARD_RETRY_DELAY = 500;

type DiscardResult =
	/** Cleared; the caller may re-install and retry. */
	| { outcome: "cleared" }
	/**
	 * Left alone because a concurrent launch already replaced it. The caller
	 * should retry against the new installation rather than delete it.
	 */
	| { outcome: "superseded" }
	/** Left alone because Chrome is known to have launched from it before. */
	| { outcome: "verified" }
	/** Could not be cleared. */
	| { outcome: "cleanup-failed"; cause: unknown };

/**
 * Backs {@link BrowserInstall.discard}: clear an installation that Chrome
 * failed to start from, unless we have positive evidence that it is fine.
 *
 * Refuses in two cases, both of which would otherwise throw away a working
 * ~150 MB download:
 *
 * - Chrome has launched from it before, so a failure now is a real bug worth
 *   surfacing rather than a corrupt download to paper over.
 * - A concurrent launch has already discarded and replaced it since
 *   `generation` was taken, so the directory on disk is no longer the one that
 *   failed — and may well be in use.
 *
 * @param generation from {@link getInstallGeneration}, taken *before* the
 * launch attempt that failed.
 */
async function discardIncompleteInstall(
	installDir: string,
	generation: number,
	log: InstallLog
): Promise<DiscardResult> {
	return withInstallLock(installDir, async () => {
		// Staleness first: if the directory has been replaced since `generation`
		// was taken, the install that failed is already gone, so the caller
		// should retry against its replacement. Checking `isInstallVerified`
		// ahead of this would report a *replaced and since proven* install as
		// "verified" and make the caller give up, even though a working Chrome
		// is sitting right there.
		if (getInstallGeneration(installDir) !== generation) {
			log.debug(
				`Not clearing ${installDir}: a concurrent launch already replaced it.`
			);
			return { outcome: "superseded" };
		}
		if (isInstallVerified(installDir)) {
			return { outcome: "verified" };
		}
		log.warn(
			`Chrome failed to start from ${installDir}, which it has never successfully started from; clearing it so it can be downloaded again.`
		);

		const deadline = Date.now() + DISCARD_TIMEOUT;
		let lastError: unknown;
		do {
			try {
				await removeDir(installDir);
				installs.generations.set(installDir, generation + 1);
				return { outcome: "cleared" };
			} catch (e) {
				lastError = e;
				log.debug(`Could not clear ${installDir} yet, retrying: ${e}`);
				await new Promise((resolve) =>
					setTimeout(resolve, DISCARD_RETRY_DELAY)
				);
			}
		} while (Date.now() < deadline);

		return { outcome: "cleanup-failed", cause: lastError };
	});
}

/**
 * Mirror of `@puppeteer/browsers`' `Cache#installationDir`.
 *
 * https://github.com/puppeteer/puppeteer/blob/main/packages/browsers/src/Cache.ts
 */
function getInstallDir(
	cacheDir: string,
	browser: Browser,
	platform: string,
	buildId: string
): string {
	return path.join(cacheDir, browser, `${platform}-${buildId}`);
}

/**
 * Regex matching the `@puppeteer/browsers` error thrown when its cache
 * directory exists but the executable inside it is missing — typically
 * because a previous `install()` was interrupted mid-extraction (test
 * timeout, process kill) or because an external agent (Windows Defender,
 * antivirus, disk cleanup) removed the executable from a previously-good
 * install.
 *
 * @puppeteer/browsers source:
 * https://github.com/puppeteer/puppeteer/blob/main/packages/browsers/src/install.ts
 */
const CORRUPTED_CACHE_ERROR_PATTERN =
	/The browser folder \((.+?)\) exists but the executable .+? is missing/;

/**
 * Run `@puppeteer/browsers` `install()`, but if it fails with the
 * "folder exists but executable is missing" error, clear the corrupted
 * cache directory and retry once.
 *
 * Recovers from a known intermittent failure on CI runners (especially
 * Windows) where the cache state can become partially populated and stay
 * that way for the rest of the run, breaking every subsequent test until
 * the runner is recycled.
 */
async function installWithCorruptedCacheRecovery(
	installOptions: InstallOptions & { unpack?: true },
	log: InstallLog
): Promise<InstalledBrowser> {
	try {
		return await install(installOptions);
	} catch (e) {
		const match = (e as Error)?.message?.match(CORRUPTED_CACHE_ERROR_PATTERN);
		if (!match) {
			throw e;
		}
		const corruptedPath = match[1];
		log.warn(
			`Detected corrupted Chrome cache at ${corruptedPath}; clearing and retrying install.`
		);
		try {
			await removeDir(corruptedPath);
		} catch (cleanupError) {
			throw new Error(
				`Failed to clear corrupted Chrome cache at ${corruptedPath} after detecting "${(e as Error).message}". Manual cleanup may be required.`,
				{ cause: cleanupError }
			);
		}
		try {
			return await install(installOptions);
		} catch (retryError) {
			throw new Error(
				`Chrome install failed after clearing corrupted cache at ${corruptedPath}: ${(retryError as Error).message}`,
				{ cause: retryError }
			);
		}
	}
}
