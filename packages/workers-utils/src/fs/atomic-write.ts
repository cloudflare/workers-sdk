import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { removeDirSync } from "../fs-helpers";
import { resolveFilePath } from "./file-path";
import { isProcessOwner, ProcessOwnerChecker } from "./process-owner";

function temporaryPrefix(filePath: string, prefix: string): string {
	return `${prefix}${createHash("sha256").update(filePath).digest("hex").slice(0, 16)}-`;
}

function removeAbandonedWrites(
	filePath: string,
	owners: ProcessOwnerChecker,
	prefixName: string
): void {
	const directory = path.dirname(filePath);
	if (!existsSync(directory)) {
		return;
	}
	const prefix = temporaryPrefix(filePath, prefixName);
	for (const entry of readdirSync(directory)) {
		if (!entry.startsWith(prefix)) {
			continue;
		}
		const owner = entry.slice(prefix.length);
		if (isProcessOwner(owner) && !owners.isAlive(owner)) {
			removeDirSync(path.join(directory, entry));
		}
	}
}

/** Settings for secure atomic replacements and abandoned-write cleanup. */
export interface AtomicWriteOptions {
	owners?: ProcessOwnerChecker;
	mode?: number;
	flush?: boolean;
	temporaryPrefix?: string;
}

/** Clear the actual destination and abandoned copies without removing symlinks. */
export function clearFile(
	filePath: string,
	options?: AtomicWriteOptions
): boolean {
	const owners = options?.owners ?? new ProcessOwnerChecker();
	const destination = resolveFilePath(filePath);
	removeAbandonedWrites(
		destination,
		owners,
		options?.temporaryPrefix ?? ".atomic-"
	);
	const existed = existsSync(destination);
	rmSync(destination, { force: true });
	return existed;
}

/**
 * Replace a file atomically; the default permissions restrict access to its owner.
 * A failed write or process crash leaves the previous file intact rather than
 * exposing partial contents to readers that do not hold a transaction lock.
 *
 * @param filePath - Destination, following existing and dangling symlinks.
 * @param contents - Complete replacement contents.
 * @param options - Permissions, flushing, ownership, and temporary-name settings.
 */
export function writeFileAtomically(
	filePath: string,
	contents: string | Uint8Array,
	options?: AtomicWriteOptions
): void {
	const owners = options?.owners ?? new ProcessOwnerChecker();
	const destination = resolveFilePath(filePath);
	const directory = path.dirname(destination);
	mkdirSync(directory, { recursive: true });
	removeAbandonedWrites(
		destination,
		owners,
		options?.temporaryPrefix ?? ".atomic-"
	);
	const temporaryDirectory = path.join(
		directory,
		temporaryPrefix(destination, options?.temporaryPrefix ?? ".atomic-") +
			owners.createOwner()
	);
	mkdirSync(temporaryDirectory, { mode: 0o700 });
	try {
		const temporaryPath = path.join(temporaryDirectory, "data");
		writeFileSync(temporaryPath, contents, {
			encoding: "utf-8",
			mode: options?.mode ?? 0o600,
			flush: options?.flush ?? true,
			flag: "wx",
		});
		renameSync(temporaryPath, destination);
	} finally {
		removeDirSync(temporaryDirectory);
	}
}
