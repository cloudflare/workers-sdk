import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const LOCK_NAME = ".miniflare-startup.lock";
// Startup is bounded, so an older lock belongs to a failed startup attempt.
const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_MS = 50;

function isErrnoException(error: unknown, code: string): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === code
	);
}

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

async function removeOwnedLock(lockPath: string, token: string): Promise<void> {
	if ((await readLock(lockPath)) === token) {
		await fs.rm(lockPath, { force: true });
	}
}

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

export async function canonicalisePersistRoot(
	persistRoot: string
): Promise<string> {
	await fs.mkdir(persistRoot, { recursive: true });
	const canonical = await fs.realpath(persistRoot);
	return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

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

	while (!acquired) {
		try {
			await fs.writeFile(lockPath, token, { flag: "wx", mode: 0o600 });
			acquired = true;
		} catch (error) {
			if (!isErrnoException(error, "EEXIST")) {
				throw error;
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
