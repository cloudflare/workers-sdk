import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const LOCK_NAME = ".miniflare-startup.lock";
// Startup is bounded, so an older lock belongs to a failed startup attempt.
const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_MS = 50;
// Generous enough to outlast a stale lock being reclaimed, low enough that a
// lock we can never remove fails loudly instead of hanging startup forever.
const LOCK_MAX_ATTEMPTS = 2 * Math.ceil(LOCK_STALE_MS / LOCK_RETRY_MS);

/**
 * @param error - Value caught from a filesystem call.
 * @param code - Errno code to test for, e.g. `"ENOENT"`.
 * @returns Whether `error` is a Node filesystem error with that code.
 */
function isErrnoException(error: unknown, code: string): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === code
	);
}

/**
 * @param lockPath - Path of the lock file.
 * @returns The lock's token, or `undefined` if it doesn't exist.
 */
async function readLock(lockPath: string): Promise<string | undefined> {
	try {
		return await fs.readFile(lockPath, "utf8");
	} catch (error) {
		if (isErrnoException(error, "ENOENT")) {
			return undefined;
		}
		throw error;
	}
}

/**
 * Remove the lock only if we still hold it, so we never delete a lock another
 * process acquired after ours was reclaimed as stale.
 *
 * @param lockPath - Path of the lock file.
 * @param token - Token written when this process acquired the lock.
 */
async function removeOwnedLock(lockPath: string, token: string): Promise<void> {
	if ((await readLock(lockPath)) === token) {
		await fs.rm(lockPath, { force: true });
	}
}

/**
 * Remove the lock if it has outlived {@link LOCK_STALE_MS}, which means the
 * process that wrote it died before releasing it.
 *
 * @param lockPath - Path of the lock file.
 */
async function removeStaleLock(lockPath: string): Promise<void> {
	try {
		const stats = await fs.stat(lockPath);
		if (stats.mtimeMs < Date.now() - LOCK_STALE_MS) {
			await fs.rm(lockPath, { force: true });
		}
	} catch (error) {
		if (!isErrnoException(error, "ENOENT")) {
			throw error;
		}
	}
}

/**
 * Resolve a persistence root to a stable identity that every process agrees
 * on, so instances sharing a directory compute the same ownership scope.
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
 * Run `callback` while holding an exclusive on-disk lock for `persistRoot`, so
 * concurrent instances sharing the directory start up one at a time.
 *
 * @param persistRoot - Directory to lock; no lock is taken when `undefined`.
 * @param callback - Work to run under the lock.
 * @returns The callback's result.
 * @throws If the lock can't be acquired within {@link LOCK_MAX_ATTEMPTS}.
 */
export async function withPersistRootStartupLock<T>(
	persistRoot: string | undefined,
	callback: () => Promise<T>
): Promise<T> {
	if (persistRoot === undefined) {
		return callback();
	}

	await fs.mkdir(persistRoot, { recursive: true });
	const lockPath = path.join(persistRoot, LOCK_NAME);
	const token = crypto.randomUUID();
	let acquired = false;

	for (let attempt = 0; !acquired; attempt++) {
		try {
			await fs.writeFile(lockPath, token, { flag: "wx", mode: 0o600 });
			acquired = true;
		} catch (error) {
			if (!isErrnoException(error, "EEXIST")) {
				throw error;
			}
			if (attempt >= LOCK_MAX_ATTEMPTS) {
				throw new Error(
					`Timed out waiting for the Miniflare startup lock at ${lockPath}. ` +
						`Another process may still be holding it -- if none is running, delete the file and retry.`
				);
			}
			await removeStaleLock(lockPath);
			await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
		}
	}

	try {
		return await callback();
	} finally {
		await removeOwnedLock(lockPath, token);
	}
}
