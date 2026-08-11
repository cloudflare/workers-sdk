import {
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmdirSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { removeDirSync } from "../fs-helpers";
import { isProcessOwner, ProcessOwnerChecker } from "./process-owner";

/** Settings for acquiring and releasing a process-owned filesystem lock. */
export interface FileLockOptions {
	owners?: ProcessOwnerChecker;
	timeoutMs?: number;
	maxRetries?: number;
	retryDelayMs?: number;
	onReleaseError?: (error: unknown) => void;
	/** Reclaim old, unowned regular-file locks only when migrating a legacy format. */
	legacyFileStaleMs?: number;
}

/** Acquisition timed out without executing the protected callback. */
export class FileLockTimeoutError extends Error {
	constructor(lockPath: string) {
		super(`Timed out waiting for the filesystem lock at ${lockPath}.`);
		this.name = "FileLockTimeoutError";
	}
}

function hasCode(error: unknown, ...codes: string[]): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		typeof error.code === "string" &&
		codes.includes(error.code)
	);
}

function releaseSafely(release: () => void, options?: FileLockOptions): void {
	try {
		release();
	} catch (error) {
		options?.onReleaseError?.(error);
	}
}

function removeOwner(lockPath: string, owner?: string): void {
	if (owner !== undefined) {
		try {
			unlinkSync(path.join(lockPath, owner));
		} catch (error) {
			if (!hasCode(error, "ENOENT")) {
				throw error;
			}
		}
	}
	try {
		rmdirSync(lockPath);
	} catch (error) {
		if (!hasCode(error, "ENOENT", "ENOTEMPTY", "EEXIST")) {
			throw error;
		}
	}
}

function removeDeadOwner(
	lockPath: string,
	owners: ProcessOwnerChecker,
	legacyFileStaleMs?: number
): void {
	let entries: string[];
	try {
		entries = readdirSync(lockPath);
	} catch (error) {
		if (hasCode(error, "ENOENT")) {
			return;
		}
		if (hasCode(error, "ENOTDIR") && legacyFileStaleMs !== undefined) {
			const stats = lstatSync(lockPath, { throwIfNoEntry: false });
			if (stats?.isFile() && stats.mtimeMs < Date.now() - legacyFileStaleMs) {
				try {
					unlinkSync(lockPath);
				} catch (unlinkError) {
					if (!hasCode(unlinkError, "ENOENT", "EISDIR", "EPERM")) {
						throw unlinkError;
					}
				}
			}
			return;
		}
		throw error;
	}
	if (entries.length === 0) {
		removeOwner(lockPath);
	} else if (entries.length === 1) {
		const owner = entries[0];
		if (
			isProcessOwner(owner) &&
			(!owners.isAlive(owner) || isOwnerReleased(lockPath, owner))
		) {
			removeOwner(lockPath, owner);
		}
	}
}

function isOwnerReleased(lockPath: string, owner: string): boolean {
	try {
		return readFileSync(path.join(lockPath, owner), "utf8") === "released";
	} catch (error) {
		if (hasCode(error, "ENOENT")) {
			return false;
		}
		throw error;
	}
}

function releaseOwner(lockPath: string, owner: string): void {
	try {
		writeFileSync(path.join(lockPath, owner), "released", { flag: "r+" });
	} catch {
		removeOwner(lockPath, owner);
		return;
	}
	removeOwner(lockPath, owner);
}

function tryAcquire(
	lockPath: string,
	owners: ProcessOwnerChecker,
	options?: FileLockOptions
): (() => void) | undefined {
	mkdirSync(path.dirname(lockPath), { recursive: true });
	const candidate = mkdtempSync(lockPath + ".");
	const owner = owners.createOwner();
	try {
		writeFileSync(path.join(candidate, owner), "", { mode: 0o600, flag: "wx" });
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				renameSync(candidate, lockPath);
				return () => releaseOwner(lockPath, owner);
			} catch (error) {
				if (!hasCode(error, "EEXIST", "ENOTEMPTY", "EPERM", "ENOTDIR")) {
					throw error;
				}
				if (attempt === 0) {
					removeDeadOwner(lockPath, owners, options?.legacyFileStaleMs);
				}
			}
		}
		return undefined;
	} finally {
		removeDirSync(candidate);
	}
}

/**
 * Attempt a synchronous transaction without waiting for another owner.
 * Ownership is published atomically and only proven dead or released owners
 * are reclaimed; a live process never loses its lock because of its age.
 *
 * @param lockPath - Canonical path shared by all participants.
 * @param callback - Transaction to execute only after acquiring the lock.
 * @param options - Ownership and release settings.
 * @returns Whether the lock was acquired, and the callback's result if so.
 */
export function tryWithFileLock<T>(
	lockPath: string,
	callback: () => T,
	options?: FileLockOptions
): { acquired: true; value: T } | { acquired: false } {
	const owners = options?.owners ?? new ProcessOwnerChecker();
	const release = tryAcquire(lockPath, owners, options);
	if (!release) {
		return { acquired: false };
	}
	try {
		return { acquired: true, value: callback() };
	} finally {
		releaseSafely(release, options);
	}
}

/**
 * Serialize a transaction across processes with a bounded acquisition wait.
 * The timeout limits waiting, never the lifetime of an acquired lock.
 *
 * @param lockPath - Canonical path shared by all participants.
 * @param callback - Transaction to execute only after acquiring the lock.
 * @param options - Retry, timeout, ownership, and release settings.
 * @returns The callback's result.
 * @throws {FileLockTimeoutError} If acquisition times out.
 */
export async function withFileLock<T>(
	lockPath: string,
	callback: () => Promise<T>,
	options?: FileLockOptions
): Promise<T> {
	const maxRetries = options?.maxRetries ?? Infinity;
	const retryDelayMs = options?.retryDelayMs ?? 100;
	const deadline = performance.now() + (options?.timeoutMs ?? 30_000);
	const owners = options?.owners ?? new ProcessOwnerChecker();
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		const release = tryAcquire(lockPath, owners, options);
		if (release) {
			try {
				return await callback();
			} finally {
				releaseSafely(release, options);
			}
		}
		const remaining = deadline - performance.now();
		if (remaining <= 0) {
			break;
		}
		if (attempt < maxRetries - 1) {
			const delay =
				options?.retryDelayMs ??
				Math.min(1_000, retryDelayMs * 2 ** Math.min(attempt, 4)) *
					(0.5 + Math.random() / 2);
			await new Promise((resolve) =>
				setTimeout(resolve, Math.min(delay, remaining))
			);
		}
	}
	throw new FileLockTimeoutError(lockPath);
}
