import fs from "node:fs/promises";
import path from "node:path";
import {
	FileLockTimeoutError,
	withFileLock,
} from "@cloudflare/workers-utils/file-system";

/**
 * Resolve a persistence root to a stable identity shared by every process.
 *
 * @param persistRoot - Directory to canonicalise; created if missing.
 * @returns The real path, lowercased on Windows for case-insensitive matching.
 */
export async function canonicalisePersistRoot(
	persistRoot: string
): Promise<string> {
	await fs.mkdir(persistRoot, { recursive: true });
	const canonical = await fs.realpath(persistRoot);
	return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

/**
 * Serialize startup without expiring another live process's ownership.
 *
 * @param persistRoot - Directory to lock, or undefined to skip locking.
 * @param callback - Startup operation protected by the lock.
 * @returns The callback's result.
 */
export async function withPersistRootStartupLock<T>(
	persistRoot: string | undefined,
	callback: () => Promise<T>
): Promise<T> {
	if (persistRoot === undefined) {
		return callback();
	}
	const lockPath = path.join(
		await canonicalisePersistRoot(persistRoot),
		".miniflare-startup.lock"
	);
	try {
		return await withFileLock(lockPath, callback, {
			timeoutMs: 60_000,
			retryDelayMs: 50,
			legacyFileStaleMs: 30_000,
		});
	} catch (error) {
		if (!(error instanceof FileLockTimeoutError)) {
			throw error;
		}
		throw new Error(
			"Timed out waiting for the Miniflare startup lock at " +
				lockPath +
				". Another process may still be holding it -- if none is running, delete the file and retry."
		);
	}
}
