import { mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readFileSync, removeDirSync } from "@cloudflare/workers-utils";

interface LockInfo {
	pid: number;
}

/**
 * Grace period (in ms) for a lock directory whose `info.json` is missing.
 * Between `mkdirSync` and `writeLockInfo` there is a brief window where the
 * directory exists but the info file does not. Treating that as immediately
 * stale would let a sibling break the lock out from under the acquirer
 * (TOCTOU). We give the acquirer this much time to finish writing.
 */
const LOCK_GRACE_MS = 5_000;

/** How many times to retry lock acquisition before giving up. */
const MAX_RETRIES = 15;

/** Delay (ms) between retry attempts. */
const RETRY_DELAY_MS = 2_000;

/**
 * Name of the file written inside the lock directory to record the
 * owning process.
 */
const LOCK_INFO_FILE = "info.json";

/**
 * @param ms - The number of milliseconds to sleep.
 * @returns A promise that resolves after the given delay.
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Read the lock-info file inside an existing lock directory.
 *
 * @param lockDir - Path to the lock directory.
 * @returns The parsed lock info, or `undefined` if the file is missing/corrupt.
 */
function readLockInfo(lockDir: string): LockInfo | undefined {
	const infoPath = path.join(lockDir, LOCK_INFO_FILE);
	try {
		const raw = readFileSync(infoPath);
		return JSON.parse(raw) as LockInfo;
	} catch {
		return undefined;
	}
}

/**
 * Write the lock-info file into an already-created lock directory.
 *
 * @param lockDir - Path to the lock directory.
 */
function writeLockInfo(lockDir: string): void {
	const info: LockInfo = { pid: process.pid };
	writeFileSync(
		path.join(lockDir, LOCK_INFO_FILE),
		JSON.stringify(info),
		"utf-8"
	);
}

/**
 * Check whether a given PID corresponds to a running process.
 *
 * @param pid - The process ID to check.
 * @returns `true` if the process is alive, `false` otherwise.
 */
function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * Determine whether an existing lock is stale.
 *
 * A lock is stale when:
 * - The info file exists and the owning process is dead.
 * - The info file is missing and the directory is older than
 *   {@link LOCK_GRACE_MS} (the acquirer had enough time to write it).
 *
 * A lock is **not** stale when:
 * - The info file is missing but the directory was created recently (the
 *   acquirer is mid-write — breaking it would be a TOCTOU race).
 * - The info file exists and the owning process is alive (even if the lock
 *   is old — a slow but legitimate refresh should not be evicted).
 *
 * @param lockDir - Path to the lock directory.
 * @returns `true` if the lock should be broken, `false` if it is still valid.
 */
function isLockStale(lockDir: string): boolean {
	const info = readLockInfo(lockDir);
	if (!info) {
		// No info file — could be a sibling mid-acquisition (dir created,
		// info.json not yet written). Only treat as stale if the directory
		// itself is older than the grace period.
		return isDirOlderThan(lockDir, LOCK_GRACE_MS);
	}
	if (!isProcessAlive(info.pid)) {
		return true;
	}
	// The holder is alive — don't evict it. A slow-but-legitimate refresh
	// (debugger-paused, slow network, suspended laptop) should keep its
	// lock. The invalid_grant retry in the caller is the safety net.
	return false;
}

/**
 * Check whether a directory's mtime is older than a given threshold.
 *
 * @param dirPath - Path to the directory.
 * @param thresholdMs - Age threshold in milliseconds.
 * @returns `true` if the directory is older than the threshold, or if the
 *   stat fails (directory may have been removed).
 */
function isDirOlderThan(dirPath: string, thresholdMs: number): boolean {
	try {
		const stats = statSync(dirPath);
		return Date.now() - stats.mtimeMs > thresholdMs;
	} catch {
		return true;
	}
}

/**
 * Forcibly remove a stale lock directory.
 *
 * @param lockDir - Path to the lock directory to break.
 */
function breakLock(lockDir: string): void {
	removeDirSync(lockDir);
}

/**
 * Result of a single lock-acquisition attempt.
 *
 * - `"acquired"` — the lock was successfully taken.
 * - `"contended"` — another process holds the lock (`EEXIST`); retrying may succeed.
 * - `"unavailable"` — a permanent filesystem error (e.g. `EACCES`, `ENOENT`);
 *   retrying will not help.
 */
type AcquireResult = "acquired" | "contended" | "unavailable";

/**
 * Try to acquire the advisory lock once.
 *
 * @param lockDir - Path to the lock directory.
 * @returns The acquisition result.
 */
function tryAcquire(lockDir: string): AcquireResult {
	try {
		mkdirSync(lockDir);
		try {
			writeLockInfo(lockDir);
		} catch {
			// Created the directory but failed to write the owner record — clean
			// up so siblings aren't blocked by a lock nobody holds.
			breakLock(lockDir);
			return "unavailable";
		}
		return "acquired";
	} catch (e: unknown) {
		if ((e as NodeJS.ErrnoException).code === "EEXIST") {
			if (isLockStale(lockDir)) {
				breakLock(lockDir);
				try {
					mkdirSync(lockDir);
					writeLockInfo(lockDir);
					return "acquired";
				} catch {
					return "contended";
				}
			}
			return "contended";
		}
		// Any other filesystem error (EACCES, EROFS, ENOSPC, etc.) means we
		// cannot take the lock; retrying will not help.
		return "unavailable";
	}
}

/**
 * Release the advisory lock by removing the lock directory.
 *
 * @param lockDir - Path to the lock directory.
 */
function releaseLock(lockDir: string): void {
	removeDirSync(lockDir);
}

/**
 * Acquire an advisory file lock, execute `fn`, and release the lock.
 *
 * The lock serializes the OAuth token refresh across sibling wrangler
 * processes on the same machine. If the lock cannot be acquired after
 * {@link MAX_RETRIES} attempts (e.g. a sibling is legitimately mid-refresh),
 * `fn` is executed without the lock — the retry-on-`invalid_grant` logic in
 * the caller provides a safety net.
 *
 * @param lockDir - Path to use as the lock directory (e.g. `storage.path() + '.refresh-lock'`).
 * @param fn - The async function to execute while holding the lock.
 * @param options - Optional overrides for retry behaviour (test-only).
 * @param options.maxRetries - Number of lock-acquisition attempts.
 * @param options.retryDelayMs - Delay between attempts in milliseconds.
 * @returns The return value of `fn`.
 */
export async function withRefreshLock<T>(
	lockDir: string,
	fn: () => Promise<T>,
	options?: { maxRetries?: number; retryDelayMs?: number }
): Promise<T> {
	const maxRetries = options?.maxRetries ?? MAX_RETRIES;
	const retryDelayMs = options?.retryDelayMs ?? RETRY_DELAY_MS;

	let acquired = false;
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		const result = tryAcquire(lockDir);
		if (result === "acquired") {
			acquired = true;
			break;
		}
		if (result === "unavailable") {
			break;
		}
		if (attempt < maxRetries - 1) {
			await sleep(retryDelayMs);
		}
	}

	try {
		return await fn();
	} finally {
		if (acquired) {
			releaseLock(lockDir);
		}
	}
}

/**
 * Visible for testing only — the constants governing lock behaviour.
 */
export const _TEST_CONSTANTS = {
	LOCK_GRACE_MS,
	MAX_RETRIES,
	RETRY_DELAY_MS,
	LOCK_INFO_FILE,
} as const;
