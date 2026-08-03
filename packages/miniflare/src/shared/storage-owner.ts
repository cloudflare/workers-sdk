import {
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";

// Election lock for the shared "central storage owner" feature. Discovery,
// liveness, and client presence all now ride the dev registry (see
// `STORAGE_OWNER_WORKER_NAME` and `StorageOwnerProxy`); the only thing the
// registry can't provide is a mutex, so a single lock file still serialises
// which client spawns the (one-per-registry) owner process.
//
//   <lockDir>/.miniflare-owner.lock   - transient lock serialising owner election

const OWNER_SPAWN_LOCK_FILE = ".miniflare-owner.lock";

// A lock whose mtime is older than this is considered stale and reclaimable.
export const OWNER_STALE_MS = 30_000;
const OWNER_LOCK_RETRY_MS = 50;

/**
 * Returns whether a process with the given pid is currently alive.
 *
 * `process.kill(pid, 0)` sends no signal but performs the permission/existence
 * check: it throws `ESRCH` if the process does not exist, and `EPERM` if it
 * exists but we lack permission to signal it (still alive).
 */
export function isProcessAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) {
		return false;
	}
	try {
		process.kill(pid, 0);
		return true;
	} catch (e) {
		return (e as NodeJS.ErrnoException).code === "EPERM";
	}
}

function ownerSpawnLockPath(lockDir: string): string {
	return path.join(lockDir, OWNER_SPAWN_LOCK_FILE);
}

/** Handle for a held owner-election lock. */
export interface OwnerSpawnLock {
	release(): void;
}

/**
 * Attempts to acquire the per-registry election lock so that exactly one client
 * spawns the owner process. `lockDir` should be a directory scoped to the dev
 * registry but *outside* the watched registry directory (so the registry's own
 * stale-file cleanup never touches it). Returns a release handle on success, or
 * `undefined` if another live process currently holds it.
 *
 * A lock whose mtime is stale or whose pid is dead is reclaimed.
 */
export function tryAcquireOwnerSpawnLock(
	lockDir: string
): OwnerSpawnLock | undefined {
	mkdirSync(lockDir, { recursive: true });
	const lockPath = ownerSpawnLockPath(lockDir);
	try {
		writeFileSync(lockPath, String(process.pid), { flag: "wx" });
		return { release: () => rmSync(lockPath, { force: true }) };
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== "EEXIST") {
			throw e;
		}
	}
	// Lock exists — reclaim if stale or owned by a dead process.
	if (isOwnerSpawnLockStale(lockPath)) {
		rmSync(lockPath, { force: true });
		try {
			writeFileSync(lockPath, String(process.pid), { flag: "wx" });
			return { release: () => rmSync(lockPath, { force: true }) };
		} catch {
			return undefined;
		}
	}
	return undefined;
}

function isOwnerSpawnLockStale(lockPath: string): boolean {
	let stats;
	try {
		stats = statSync(lockPath, { throwIfNoEntry: false });
	} catch {
		return true;
	}
	if (stats === undefined) {
		return true;
	}
	if (stats.mtime.getTime() < Date.now() - OWNER_STALE_MS) {
		return true;
	}
	let pid: number;
	try {
		pid = Number(readFileSync(lockPath, { encoding: "utf8" }).trim());
	} catch {
		return true;
	}
	return !isProcessAlive(pid);
}

export { OWNER_LOCK_RETRY_MS };
