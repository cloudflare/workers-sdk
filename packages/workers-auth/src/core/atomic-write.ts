import { mkdirSync, mkdtempSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";

/**
 * Replaces a credential/config file atomically with an owner-readable file.
 * A failed write or process crash leaves the previous file intact rather than
 * exposing a truncated token to readers that do not hold the credential lock.
 */
export function writeFileAtomically(filePath: string, contents: string): void {
	const directory = path.dirname(filePath);
	mkdirSync(directory, { recursive: true });
	const temporaryDirectory = mkdtempSync(path.join(directory, ".auth-"));
	try {
		const temporaryPath = path.join(temporaryDirectory, "data");
		writeFileSync(temporaryPath, contents, {
			encoding: "utf-8",
			mode: 0o600,
			flush: true,
		});
		renameSync(temporaryPath, filePath);
	} finally {
		removeDirSync(temporaryDirectory);
	}
}
