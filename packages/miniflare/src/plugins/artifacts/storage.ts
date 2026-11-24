import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
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

const NAMESPACE_MARKER = "namespace.json";

export interface LocalNamespaceRecord {
	namespace: string;
	createdAt: string;
}

/**
 * Namespace directories are hashed, so record the name beside them. Tools
 * without an Artifacts binding, such as `cf --local`, find namespaces this way.
 * Returns the namespace's recorded creation time.
 */
export async function recordLocalNamespace(
	persistPath: string,
	namespace: string
): Promise<LocalNamespaceRecord> {
	const marker = path.join(persistPath, NAMESPACE_MARKER);
	const existing = await readNamespaceMarker(marker);
	if (existing?.namespace === namespace) {
		return existing;
	}
	const record = { namespace, createdAt: new Date().toISOString() };
	await writeFile(marker, `${JSON.stringify(record)}\n`);
	return record;
}

/**
 * Lists namespaces recorded under the Artifacts persistence root. A directory
 * only counts when its recorded name hashes back to it.
 */
export async function findLocalNamespaces(
	root: string,
	namespaceDirectory: (namespace: string) => string
): Promise<string[]> {
	let entries;
	try {
		entries = await readdir(root, { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}
		throw error;
	}
	const namespaces: string[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory() || !/^[0-9a-f]{32}$/.test(entry.name)) {
			continue;
		}
		const record = await readNamespaceMarker(
			path.join(root, entry.name, NAMESPACE_MARKER)
		);
		if (record && namespaceDirectory(record.namespace) === entry.name) {
			namespaces.push(record.namespace);
		}
	}
	return namespaces.sort();
}

async function readNamespaceMarker(
	marker: string
): Promise<LocalNamespaceRecord | undefined> {
	try {
		const value = JSON.parse(await readFile(marker, "utf8")) as unknown;
		if (
			typeof value === "object" &&
			value !== null &&
			"namespace" in value &&
			typeof value.namespace === "string" &&
			"createdAt" in value &&
			typeof value.createdAt === "string"
		) {
			return { namespace: value.namespace, createdAt: value.createdAt };
		}
	} catch {}
	return undefined;
}
