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
import { removeDirSync } from "@cloudflare/workers-utils";
import { resolveFilePath } from "./file-path";
import {
	createProcessOwner,
	isProcessOwner,
	isProcessOwnerAlive,
} from "./process-owner";

function temporaryPrefix(filePath: string): string {
	return `.auth-${createHash("sha256").update(filePath).digest("hex").slice(0, 16)}-`;
}

function removeAbandonedWrites(filePath: string): void {
	const directory = path.dirname(filePath);
	if (!existsSync(directory)) {
		return;
	}
	const prefix = temporaryPrefix(filePath);
	for (const entry of readdirSync(directory)) {
		if (!entry.startsWith(prefix)) {
			continue;
		}
		const owner = entry.slice(prefix.length);
		if (isProcessOwner(owner) && !isProcessOwnerAlive(owner)) {
			removeDirSync(path.join(directory, entry));
		}
	}
}

/** Clear the actual destination and abandoned copies without removing symlinks. */
export function clearFile(filePath: string): boolean {
	const destination = resolveFilePath(filePath);
	removeAbandonedWrites(destination);
	const existed = existsSync(destination);
	rmSync(destination, { force: true });
	return existed;
}

/**
 * Replaces a credential/config file atomically with an owner-readable file.
 * A failed write or process crash leaves the previous file intact rather than
 * exposing a truncated token to readers that do not hold the credential lock.
 */
export function writeFileAtomically(filePath: string, contents: string): void {
	const destination = resolveFilePath(filePath);
	const directory = path.dirname(destination);
	mkdirSync(directory, { recursive: true });
	removeAbandonedWrites(destination);
	const temporaryDirectory = path.join(
		directory,
		temporaryPrefix(destination) + createProcessOwner()
	);
	mkdirSync(temporaryDirectory, { mode: 0o700 });
	try {
		const temporaryPath = path.join(temporaryDirectory, "data");
		writeFileSync(temporaryPath, contents, {
			encoding: "utf-8",
			mode: 0o600,
			flush: true,
			flag: "wx",
		});
		renameSync(temporaryPath, destination);
	} finally {
		removeDirSync(temporaryDirectory);
	}
}
