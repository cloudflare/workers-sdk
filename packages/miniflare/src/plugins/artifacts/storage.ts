import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";

/**
 * Keep repository paths short: native Git adds long pack and lock filenames.
 * Hash the tuple rather than nesting namespace and repository hashes. Each
 * identifier retains 128 bits and no user input becomes a path component.
 */
export function repositoryDirectory(namespace: string, name: string): string {
	const id = createHash("sha256")
		.update(JSON.stringify([namespace, name]))
		.digest("hex")
		.slice(0, 32);
	return `${id}.git`;
}

export function repositoryPath(
	root: string,
	namespace: string,
	name: string
): string {
	return path.join(root, repositoryDirectory(namespace, name));
}

/** Do not quietly abandon repositories written by earlier unreleased layouts. */
export async function assertSupportedGitLayout(root: string): Promise<void> {
	const entries = await readdir(root, { withFileTypes: true });
	if (
		entries.some(
			(entry) =>
				entry.isDirectory() &&
				(/^[0-9a-f]{64}$/.test(entry.name) || /^artifacts[-:]/.test(entry.name))
		)
	) {
		throw new Error(
			"Local Artifacts storage uses an older draft layout. Back up your local repositories, then reset the Artifacts persistence directory before restarting."
		);
	}
}
