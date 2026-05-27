import fs from "node:fs";
import path from "node:path";
import onExit from "signal-exit";
import { removeDirSync } from "./fs-helpers";

/**
 * A short-lived directory. Automatically removed when the process exits, but
 * can be removed earlier by calling `remove()`.
 */
export interface EphemeralDirectory {
	path: string;
	remove(): void;
}

/**
 * Gets the path to the project's `.wrangler` folder.
 */
export function getWranglerHiddenDirPath(
	projectRoot: string | undefined
): string {
	projectRoot ??= process.cwd();
	return path.join(projectRoot, ".wrangler");
}

/**
 * Maximum age of a `.wrangler/tmp/*` entry before we treat it as orphaned and
 * eligible for the startup sweep. Tuned to avoid touching any directory a
 * concurrent wrangler session might still own.
 */
const STALE_WRANGLER_TMP_DIR_MS = 24 * 60 * 60 * 1000;

/**
 * Tracks tmp roots already swept by this process so repeated
 * `getWranglerTmpDir` calls within one wrangler invocation only scan once.
 */
const sweptTmpRoots = new Set<string>();

/**
 * Removes stale `.wrangler/tmp/*` entries left behind by previous wrangler
 * sessions that exited abnormally (SIGKILL, OOM, host crash) and so missed
 * the `signal-exit` cleanup. Runs at most once per tmp root per process.
 *
 * Exported for tests.
 */
export function sweepStaleWranglerTmpDirs(tmpRoot: string): void {
	if (sweptTmpRoots.has(tmpRoot)) {
		return;
	}
	sweptTmpRoots.add(tmpRoot);

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(tmpRoot, { withFileTypes: true });
	} catch {
		return;
	}

	const cutoff = Date.now() - STALE_WRANGLER_TMP_DIR_MS;
	for (const entry of entries) {
		if (!entry.isDirectory()) {
			continue;
		}
		const entryPath = path.join(tmpRoot, entry.name);
		try {
			if (fs.statSync(entryPath).mtimeMs < cutoff) {
				removeDirSync(entryPath);
			}
		} catch {
			/* best effort - another process may have removed it first */
		}
	}
}

/**
 * Gets a temporary directory in the project's `.wrangler` folder with the
 * specified prefix. We create temporary directories in `.wrangler` as opposed
 * to the OS's temporary directory to avoid issues with different drive letters
 * on Windows. For example, when `esbuild` outputs a file to a different drive
 * than the input sources, the generated source maps are incorrect.
 */
export function getWranglerTmpDir(
	projectRoot: string | undefined,
	prefix: string,
	cleanup = true
): EphemeralDirectory {
	const tmpRoot = path.join(getWranglerHiddenDirPath(projectRoot), "tmp");
	fs.mkdirSync(tmpRoot, { recursive: true });
	sweepStaleWranglerTmpDirs(tmpRoot);

	const tmpPrefix = path.join(tmpRoot, `${prefix}-`);
	const tmpDir = fs.realpathSync(fs.mkdtempSync(tmpPrefix));

	const cleanupDir = () => {
		if (cleanup) {
			try {
				removeDirSync(tmpDir);
			} catch {
				/* best effort */
			}
		}
	};
	const removeExitListener = onExit(cleanupDir);

	return {
		path: tmpDir,
		remove() {
			removeExitListener();
			cleanupDir();
		},
	};
}
