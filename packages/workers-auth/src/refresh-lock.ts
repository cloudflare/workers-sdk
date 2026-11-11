import {
	mkdirSync,
	mkdtempSync,
	lstatSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmdirSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { removeDirSync, UserError } from "@cloudflare/workers-utils";
import { resolveFilePath } from "./core/file-path";
import { isProcessOwner, ProcessOwnerChecker } from "./core/process-owner";
import { AUTH_REQUEST_TIMEOUT_MS } from "./core/timeouts";
import type { OAuthFlowLogger } from "./context";

const LOCK_TIMEOUT_MS = AUTH_REQUEST_TIMEOUT_MS * 3;
const RETRY_DELAY_MS = 100;
const MAX_RETRY_DELAY_MS = 1_000;

/** Return the same profile-level lock for plaintext and encrypted credentials. */
export function getRefreshLockPath(storagePath: string): string {
	const profilePath = storagePath.replace(/\.(?:toml|json|enc)$/, "");
	for (const extension of ["toml", "json", "enc"]) {
		const sibling = `${profilePath}.${extension}`;
		if (lstatSync(sibling, { throwIfNoEntry: false })?.isSymbolicLink()) {
			return (
				resolveFilePath(sibling).replace(/\.(?:toml|json|enc)$/, "") +
				".refresh-lock"
			);
		}
	}
	return (
		resolveFilePath(storagePath).replace(/\.(?:toml|json|enc)$/, "") +
		".refresh-lock"
	);
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

function releaseSafely(
	release: () => void,
	logger?: Pick<OAuthFlowLogger, "debug">
): void {
	try {
		release();
	} catch {
		logger?.debug("Could not remove the credential lock.");
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

function removeDeadOwner(lockDir: string, owners: ProcessOwnerChecker): void {
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
		if (
			isProcessOwner(owner) &&
			(!owners.isAlive(owner) || isOwnerReleased(lockDir, owner))
		) {
			removeOwner(lockDir, owner);
		}
	}
}

function isOwnerReleased(lockDir: string, owner: string): boolean {
	try {
		return readFileSync(path.join(lockDir, owner), "utf8") === "released";
	} catch (error) {
		if (hasCode(error, "ENOENT")) {
			return true;
		}
		throw error;
	}
}

/** Record completion without requiring permission to rename directory entries. */
function releaseOwner(lockDir: string, owner: string): void {
	try {
		writeFileSync(path.join(lockDir, owner), "released", { flag: "r+" });
	} catch {
		removeOwner(lockDir, owner);
		return;
	}
	removeOwner(lockDir, owner);
}

/**
 * Publish a non-empty directory in one rename, so ownership metadata is never
 * missing or partially written at the lock path, even if the acquirer crashes.
 * Unknown owners and PIDs whose liveness cannot be established fail closed.
 */
function tryAcquire(
	lockDir: string,
	owners: ProcessOwnerChecker
): (() => void) | undefined {
	mkdirSync(path.dirname(lockDir), { recursive: true });
	const candidate = mkdtempSync(lockDir + ".");
	const owner = owners.createOwner();
	try {
		writeFileSync(path.join(candidate, owner), "", { mode: 0o600, flag: "wx" });
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				renameSync(candidate, lockDir);
				return () => releaseOwner(lockDir, owner);
			} catch (error) {
				if (!hasCode(error, "EEXIST", "ENOTEMPTY", "EPERM")) {
					throw error;
				}
				if (attempt === 0) {
					removeDeadOwner(lockDir, owners);
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
	fn: () => T,
	logger?: Pick<OAuthFlowLogger, "debug">,
	owners = new ProcessOwnerChecker()
): { acquired: true; value: T } | { acquired: false } {
	const release = tryAcquire(lockDir, owners);
	if (!release) {
		return { acquired: false };
	}
	try {
		return { acquired: true, value: fn() };
	} finally {
		releaseSafely(release, logger);
	}
}

/**
 * Serialize credential transactions across processes. A timeout or filesystem
 * failure never invokes the callback without owning the lock.
 *
 * @param lockDir - Canonical profile-level lock path.
 * @param fn - Transaction to execute while holding the lock.
 * @param options - Retry settings, logger, and an optional owned identity cache.
 * @returns The transaction's result.
 */
export async function withRefreshLock<T>(
	lockDir: string,
	fn: () => Promise<T>,
	options?: {
		maxRetries?: number;
		retryDelayMs?: number;
		timeoutMs?: number;
		logger?: Pick<OAuthFlowLogger, "debug">;
		owners?: ProcessOwnerChecker;
	}
): Promise<T> {
	const maxRetries = options?.maxRetries ?? Infinity;
	const retryDelayMs = options?.retryDelayMs ?? RETRY_DELAY_MS;
	const deadline = performance.now() + (options?.timeoutMs ?? LOCK_TIMEOUT_MS);
	const owners = options?.owners ?? new ProcessOwnerChecker();

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		const release = tryAcquire(lockDir, owners);
		if (release) {
			try {
				return await fn();
			} finally {
				releaseSafely(release, options?.logger);
			}
		}
		const remaining = deadline - performance.now();
		if (remaining <= 0) {
			break;
		}
		if (attempt < maxRetries - 1) {
			const delay =
				options?.retryDelayMs ??
				Math.min(MAX_RETRY_DELAY_MS, retryDelayMs * 2 ** Math.min(attempt, 4)) *
					(0.5 + Math.random() / 2);
			await new Promise((resolve) =>
				setTimeout(resolve, Math.min(delay, remaining))
			);
		}
	}
	throw new UserError(
		"Another process is updating the saved credentials. No credentials were changed. Wait for it to finish and retry the command.",
		{ telemetryMessage: "workers-auth credential lock timeout" }
	);
}
