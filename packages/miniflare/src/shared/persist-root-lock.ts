import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const LOCK_NAME = ".miniflare-startup.lock";
const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_MS = 50;
const LOCK_HEARTBEAT_MS = 1_000;

interface LockRecord {
	pid: number;
	token: string;
}

function isErrnoException(error: unknown, code: string): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === code
	);
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return isErrnoException(error, "EPERM");
	}
}

async function readLock(lockPath: string): Promise<LockRecord | undefined> {
	try {
		const value: unknown = JSON.parse(await fs.readFile(lockPath, "utf8"));
		if (
			typeof value === "object" &&
			value !== null &&
			"pid" in value &&
			typeof value.pid === "number" &&
			"token" in value &&
			typeof value.token === "string"
		) {
			return { pid: value.pid, token: value.token };
		}
	} catch (error) {
		if (!isErrnoException(error, "ENOENT")) {
			return undefined;
		}
	}
	return undefined;
}

async function ownsLock(lockPath: string, token: string): Promise<boolean> {
	return (await readLock(lockPath))?.token === token;
}

async function removeOwnedLock(lockPath: string, token: string): Promise<void> {
	if (await ownsLock(lockPath, token)) {
		await fs.rm(lockPath, { force: true });
	}
}

async function createOwnedFile(
	filePath: string,
	record: LockRecord
): Promise<boolean> {
	const temporaryPath = `${filePath}.${record.token}.tmp`;
	await fs.writeFile(temporaryPath, JSON.stringify(record), {
		flag: "wx",
		mode: 0o600,
	});
	try {
		await fs.link(temporaryPath, filePath);
		return true;
	} catch (error) {
		if (isErrnoException(error, "EEXIST")) {
			return false;
		}
		throw error;
	} finally {
		await fs.rm(temporaryPath, { force: true });
	}
}

async function reclaimAbandonedClaim(claimPath: string): Promise<void> {
	let stats: Awaited<ReturnType<typeof fs.stat>>;
	try {
		stats = await fs.stat(claimPath);
	} catch (error) {
		if (isErrnoException(error, "ENOENT")) {
			return;
		}
		throw error;
	}
	if (stats.mtimeMs >= Date.now() - LOCK_STALE_MS) {
		return;
	}
	const claim = await readLock(claimPath);
	if (claim !== undefined && !isProcessAlive(claim.pid)) {
		await removeOwnedLock(claimPath, claim.token);
	}
}

async function tryReclaimLock(lockPath: string): Promise<void> {
	let stats: Awaited<ReturnType<typeof fs.stat>>;
	try {
		stats = await fs.stat(lockPath);
	} catch (error) {
		if (isErrnoException(error, "ENOENT")) {
			return;
		}
		throw error;
	}

	if (stats.mtimeMs >= Date.now() - LOCK_STALE_MS) {
		return;
	}

	const record = await readLock(lockPath);
	if (record !== undefined && isProcessAlive(record.pid)) {
		return;
	}

	// All contenders inspecting this lock token compete for one reclamation
	// claim. The winner re-reads the lock after claiming, so it cannot remove a
	// replacement carrying a different token.
	const observedToken = record?.token ?? "malformed";
	const claimPath = `${lockPath}.${observedToken}.reclaim`;
	const claimToken = crypto.randomUUID();
	if (
		!(await createOwnedFile(claimPath, {
			pid: process.pid,
			token: claimToken,
		}))
	) {
		await reclaimAbandonedClaim(claimPath);
		return;
	}
	try {
		const current = await readLock(lockPath);
		if (current?.token === record?.token) {
			const currentStats = await fs.stat(lockPath);
			if (
				currentStats.mtimeMs < Date.now() - LOCK_STALE_MS &&
				(current === undefined || !isProcessAlive(current.pid))
			) {
				const quarantinePath = `${lockPath}.${claimToken}.reclaimed`;
				await fs.rename(lockPath, quarantinePath);
				await fs.rm(quarantinePath, { force: true });
			}
		}
	} finally {
		await removeOwnedLock(claimPath, claimToken);
	}
}

export async function canonicalisePersistRoot(
	persistRoot: string
): Promise<string> {
	await fs.mkdir(persistRoot, { recursive: true });
	const canonical = await fs.realpath(persistRoot);
	return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

export async function withPersistRootStartupLock<T>(
	persistRoot: string | undefined,
	signal: AbortSignal,
	callback: () => Promise<T>
): Promise<T> {
	if (persistRoot === undefined || signal.aborted) {
		return callback();
	}

	await fs.mkdir(persistRoot, { recursive: true });
	const lockPath = path.join(persistRoot, LOCK_NAME);
	const token = crypto.randomUUID();
	let acquired = false;

	while (!acquired && !signal.aborted) {
		acquired = await createOwnedFile(lockPath, { pid: process.pid, token });
		if (!acquired) {
			await tryReclaimLock(lockPath);
			await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
		}
	}

	if (!acquired) {
		return callback();
	}

	let heartbeatRunning = false;
	const heartbeat = setInterval(() => {
		if (heartbeatRunning) {
			return;
		}
		heartbeatRunning = true;
		void ownsLock(lockPath, token)
			.then((owned) => {
				if (owned) {
					return fs.utimes(lockPath, new Date(), new Date());
				}
			})
			.catch(() => {})
			.finally(() => {
				heartbeatRunning = false;
			});
	}, LOCK_HEARTBEAT_MS);

	try {
		return await callback();
	} finally {
		clearInterval(heartbeat);
		await removeOwnedLock(lockPath, token);
	}
}
