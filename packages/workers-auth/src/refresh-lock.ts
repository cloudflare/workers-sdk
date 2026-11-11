import { randomUUID } from "node:crypto";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	renameSync,
	rmdirSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { removeDirSync, UserError } from "@cloudflare/workers-utils";

const MAX_RETRIES = 15;
const RETRY_DELAY_MS = 2_000;
const OWNER_PATTERN = /^owner-([1-9]\d*)-[\da-f-]{36}$/;

/** Return the same profile-level lock for plaintext and encrypted credentials. */
export function getRefreshLockPath(storagePath: string): string {
	return storagePath.replace(/\.(?:toml|json|enc)$/, "") + ".refresh-lock";
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

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return !hasCode(error, "ESRCH");
	}
}

/**
 * Remove only this owner's entry, then remove the directory only if empty.
 * A delayed releaser or concurrent stale-lock reaper cannot delete a successor's
 * uniquely named entry, and rmdir cannot remove a published, non-empty lock.
 */
function removeOwner(lockDir: string, owner?: string): void {
	if (owner !== undefined) {
		try {
			unlinkSync(path.join(lockDir, owner));
		} catch (error) {
			if (!hasCode(error, "ENOENT")) {
				throw error;
			}
		}
	}
	try {
		rmdirSync(lockDir);
	} catch (error) {
		if (!hasCode(error, "ENOENT", "ENOTEMPTY", "EEXIST")) {
			throw error;
		}
	}
}

function removeDeadOwner(lockDir: string): void {
	let entries: string[];
	try {
		entries = readdirSync(lockDir);
	} catch (error) {
		if (hasCode(error, "ENOENT")) {
			return;
		}
		throw error;
	}
	if (entries.length === 0) {
		removeOwner(lockDir);
	} else if (entries.length === 1) {
		const owner = entries[0];
		const match = OWNER_PATTERN.exec(owner);
		if (match && !isProcessAlive(Number(match[1]))) {
			removeOwner(lockDir, owner);
		}
	}
}

/**
 * Publish a non-empty directory in one rename, so ownership metadata is never
 * missing or partially written at the lock path, even if the acquirer crashes.
 * Unknown owners and PIDs whose liveness cannot be established fail closed.
 */
function tryAcquire(lockDir: string): (() => void) | undefined {
	mkdirSync(path.dirname(lockDir), { recursive: true });
	const candidate = mkdtempSync(lockDir + ".");
	const owner = `owner-${process.pid}-${randomUUID()}`;
	try {
		writeFileSync(path.join(candidate, owner), "", { mode: 0o600, flag: "wx" });
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				renameSync(candidate, lockDir);
				return () => removeOwner(lockDir, owner);
			} catch (error) {
				if (!hasCode(error, "EEXIST", "ENOTEMPTY", "EPERM")) {
					throw error;
				}
				if (attempt === 0) {
					removeDeadOwner(lockDir);
				}
			}
		}
		return undefined;
	} finally {
		removeDirSync(candidate);
	}
}

/**
 * Attempt a synchronous credential mutation without waiting. A contended lock
 * skips the callback, allowing synchronous readers to defer backend migration.
 */
export function tryWithRefreshLock<T>(
	lockDir: string,
	fn: () => T
): { acquired: true; value: T } | { acquired: false } {
	const release = tryAcquire(lockDir);
	if (!release) {
		return { acquired: false };
	}
	try {
		return { acquired: true, value: fn() };
	} finally {
		release();
	}
}

/**
 * Serialize credential transactions across processes. A timeout or filesystem
 * failure never invokes the callback without owning the lock.
 *
 * @param lockDir - Canonical profile-level lock path.
 * @param fn - Transaction to execute while holding the lock.
 * @param options - Optional lock acquisition retry settings.
 * @returns The transaction's result.
 */
export async function withRefreshLock<T>(
	lockDir: string,
	fn: () => Promise<T>,
	options?: { maxRetries?: number; retryDelayMs?: number }
): Promise<T> {
	const maxRetries = options?.maxRetries ?? MAX_RETRIES;
	const retryDelayMs = options?.retryDelayMs ?? RETRY_DELAY_MS;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		const release = tryAcquire(lockDir);
		if (release) {
			try {
				return await fn();
			} finally {
				release();
			}
		}
		if (attempt < maxRetries - 1) {
			await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
		}
	}
	throw new UserError(
		"Another process is updating the saved credentials. No credentials were changed. Wait for it to finish and retry the command.",
		{ telemetryMessage: "workers-auth credential lock timeout" }
	);
}
