import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";

// Filesystem layout under a persist root for the "central storage owner" feature:
//
//   <persistRoot>/.miniflare-owner.json   - the live owner's definition (heartbeated)
//   <persistRoot>/.miniflare-owner.lock   - transient lock serialising owner election
//   <persistRoot>/.miniflare-owner-clients/<pid> - one heartbeat file per live client
//
// Exactly one process per persist root publishes the owner definition; every
// other Miniflare instance reads it and routes its storage there.

const OWNER_DEFINITION_FILE = ".miniflare-owner.json";
const OWNER_SPAWN_LOCK_FILE = ".miniflare-owner.lock";
const OWNER_CLIENTS_DIR = ".miniflare-owner-clients";

// The owner definition / lock is considered stale once its mtime is older than
// this. Heartbeats run well within this window.
export const OWNER_STALE_MS = 30_000;
export const OWNER_HEARTBEAT_MS = 5_000;
const OWNER_LOCK_RETRY_MS = 50;

export interface StorageOwnerDefinition {
	/** PID of the owner process, used for liveness / orphan reclaim. */
	pid: number;
	/**
	 * HTTP address of the owner's storage server (e.g. "127.0.0.1:12345").
	 * Clients route their KV/R2/D1 bindings here via the remote-bindings proxy
	 * client, addressing individual resources by a type-prefixed key (e.g.
	 * "kv:<id>") carried in the `MF-Binding` header.
	 */
	httpAddress: string;
	/** Wall-clock time the definition was last (re)written. */
	updatedAt: number;
}

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

function ownerDefinitionPath(persistRoot: string): string {
	return path.join(persistRoot, OWNER_DEFINITION_FILE);
}

function ownerSpawnLockPath(persistRoot: string): string {
	return path.join(persistRoot, OWNER_SPAWN_LOCK_FILE);
}

function ownerClientsDir(persistRoot: string): string {
	return path.join(persistRoot, OWNER_CLIENTS_DIR);
}

/**
 * Reads the current owner definition for a persist root, or `undefined` if there
 * is no live owner. A definition is considered absent when the file is missing,
 * unparseable, its heartbeat is stale, or its process is dead.
 */
export function readStorageOwner(
	persistRoot: string
): StorageOwnerDefinition | undefined {
	const definitionPath = ownerDefinitionPath(persistRoot);
	let stats;
	try {
		stats = statSync(definitionPath, { throwIfNoEntry: false });
	} catch {
		return undefined;
	}
	if (stats === undefined) {
		return undefined;
	}
	if (stats.mtime.getTime() < Date.now() - OWNER_STALE_MS) {
		return undefined;
	}
	let definition: StorageOwnerDefinition;
	try {
		definition = JSON.parse(
			readFileSync(definitionPath, { encoding: "utf8" })
		) as StorageOwnerDefinition;
	} catch {
		return undefined;
	}
	if (!isProcessAlive(definition.pid)) {
		return undefined;
	}
	return definition;
}

/**
 * Atomically writes the owner definition (write-to-temp + rename) so concurrent
 * readers never observe a partial file.
 */
export function writeStorageOwner(
	persistRoot: string,
	definition: StorageOwnerDefinition
): void {
	mkdirSync(persistRoot, { recursive: true });
	const definitionPath = ownerDefinitionPath(persistRoot);
	const tmpPath = `${definitionPath}.${process.pid}.tmp`;
	writeFileSync(tmpPath, JSON.stringify(definition, null, 2));
	renameSync(tmpPath, definitionPath);
}

/**
 * Removes the owner definition if it belongs to the given pid (or is already
 * dead/stale). Used by the owner on shutdown and by clients reclaiming an
 * orphaned lease.
 */
export function clearStorageOwner(persistRoot: string, pid?: number): void {
	const definitionPath = ownerDefinitionPath(persistRoot);
	if (pid !== undefined) {
		const current = readStorageOwnerRaw(persistRoot);
		if (current !== undefined && current.pid !== pid) {
			// Belongs to a different live owner — don't stomp it.
			if (isProcessAlive(current.pid)) {
				return;
			}
		}
	}
	rmSync(definitionPath, { force: true });
}

/** Reads the definition ignoring staleness/liveness (raw bytes). */
function readStorageOwnerRaw(
	persistRoot: string
): StorageOwnerDefinition | undefined {
	try {
		return JSON.parse(
			readFileSync(ownerDefinitionPath(persistRoot), { encoding: "utf8" })
		) as StorageOwnerDefinition;
	} catch {
		return undefined;
	}
}

/** Touches the owner definition mtime to signal liveness. */
export function heartbeatStorageOwner(persistRoot: string): void {
	try {
		const now = new Date();
		utimesSync(ownerDefinitionPath(persistRoot), now, now);
	} catch {
		// File may have been reclaimed; the owner's publish loop will rewrite it.
	}
}

/** Handle for a held owner-election lock. */
export interface OwnerSpawnLock {
	release(): void;
}

/**
 * Attempts to acquire the per-persist-root election lock so that exactly one
 * client spawns the owner process. Returns a release handle on success, or
 * `undefined` if another live process currently holds it.
 *
 * A lock whose mtime is stale or whose pid is dead is reclaimed.
 */
export function tryAcquireOwnerSpawnLock(
	persistRoot: string
): OwnerSpawnLock | undefined {
	mkdirSync(persistRoot, { recursive: true });
	const lockPath = ownerSpawnLockPath(persistRoot);
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

// --- Client presence registry (used by lifecycle guards) ---

/**
 * Registers this process as a live client of the owner by writing a heartbeat
 * file named after its pid. Returns the file path so the caller can heartbeat
 * and remove it on dispose.
 */
export function registerStorageClient(persistRoot: string): string {
	const dir = ownerClientsDir(persistRoot);
	mkdirSync(dir, { recursive: true });
	const clientPath = path.join(dir, String(process.pid));
	writeFileSync(clientPath, String(Date.now()));
	return clientPath;
}

export function heartbeatStorageClient(clientPath: string): void {
	try {
		const now = new Date();
		utimesSync(clientPath, now, now);
	} catch {
		// File removed by reclaim; caller will re-register on next assemble.
	}
}

export function unregisterStorageClient(clientPath: string): void {
	rmSync(clientPath, { force: true });
}

/**
 * Counts live clients of the owner, reclaiming stale entries (dead pid or stale
 * mtime). Used by the owner to decide when it can tear itself down.
 */
export function countLiveStorageClients(persistRoot: string): number {
	const dir = ownerClientsDir(persistRoot);
	if (!existsSync(dir)) {
		return 0;
	}
	let count = 0;
	for (const name of readdirSync(dir)) {
		const clientPath = path.join(dir, name);
		const pid = Number(name);
		let stats;
		try {
			stats = statSync(clientPath, { throwIfNoEntry: false });
		} catch {
			continue;
		}
		if (stats === undefined) {
			continue;
		}
		const stale = stats.mtime.getTime() < Date.now() - OWNER_STALE_MS;
		if (stale || !isProcessAlive(pid)) {
			rmSync(clientPath, { force: true });
			continue;
		}
		count++;
	}
	return count;
}
