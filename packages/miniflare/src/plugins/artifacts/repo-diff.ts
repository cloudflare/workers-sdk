import { Buffer } from "node:buffer";

/** Options for a snapshot diff page. */
export interface ArtifactsDiffOptions {
	limit?: number;
	cursor?: string;
}

/** One changed file, symlink, or gitlink. Directories are never returned. */
export interface ArtifactsDiffEntry {
	path: string;
	status: "added" | "modified" | "deleted" | "type_changed";
	oldMode?: string;
	newMode?: string;
	oldHash?: string;
	newHash?: string;
}

/** A page ordered by raw path bytes, with resolved commit identities. */
export interface ArtifactsDiffResult {
	from: string | null;
	to: string;
	changes: ArtifactsDiffEntry[];
	cursor?: string;
}

/** Tree entry with a hexadecimal encoding of its raw name bytes. */
export interface DiffTreeEntry {
	name: string;
	mode: string;
	hash: string;
}

/** Bounded object loader; names are hex, not decoded filenames. */
export interface DiffSource {
	resolve(
		ref: string,
		side: "from" | "to"
	): Promise<{ hash: string; tree: string }>;
	tree(hash: string): Promise<DiffTreeEntry[]>;
	fail(
		this: void,
		code: "INVALID_INPUT" | "MEMORY_LIMIT",
		message: string
	): never;
}

/** Maximum raw tree/commit/tag payload buffered by diff, before parsing. */
export const DIFF_OBJECT_LIMIT = 512 * 1024;
const MAX_PENDING_BYTES = 8 * 1024 * 1024;
const MAX_PATH_BYTES = 4096;
const MAX_DEPTH = 256;
const HEX40 = /^[0-9a-fA-F]{40}$/;

/** Validate before resolving refs or accepting a cursor. */
export function validateDiffInput(
	from: string | null,
	to: string,
	opts: ArtifactsDiffOptions | undefined,
	fail: DiffSource["fail"]
): number {
	for (const [side, ref] of [
		["from", from],
		["to", to],
	] as const) {
		if (side === "from" && ref === null) continue;
		// Full ref names and short branch/tag names are both accepted. Revision
		// expressions and abbreviated object IDs are deliberately not accepted.
		if (
			typeof ref !== "string" ||
			ref.length === 0 ||
			ref.length > 1024 ||
			(!HEX40.test(ref) &&
				(/[~^:?*[\\]/.test(ref) ||
					Array.from(ref).some(
						(character) =>
							character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127
					) ||
					ref.includes("..") ||
					ref.includes("@{") ||
					ref.includes("//") ||
					ref.startsWith("-") ||
					ref.startsWith("/") ||
					ref.endsWith("/") ||
					ref
						.split("/")
						.some(
							(part) =>
								part.startsWith(".") ||
								part.endsWith(".") ||
								part.endsWith(".lock")
						) ||
					(/^[0-9a-fA-F]+$/.test(ref) && ref.length >= 7) ||
					(ref.length === 40 && !ref.includes("/"))))
		) {
			fail(
				"INVALID_INPUT",
				`${side} must be a branch, tag, or full 40-character commit hash`
			);
		}
	}
	if (
		opts !== undefined &&
		(opts === null || typeof opts !== "object" || Array.isArray(opts))
	)
		fail("INVALID_INPUT", "opts must be an object");
	const limit = opts?.limit ?? 100;
	if (
		!Number.isInteger(limit) ||
		limit < 1 ||
		limit > 1000 ||
		opts?.limit === null
	)
		fail("INVALID_INPUT", "limit must be an integer between 1 and 1000");
	if (
		opts?.cursor !== undefined &&
		(typeof opts.cursor !== "string" ||
			opts.cursor.length === 0 ||
			opts.cursor.length > 24000)
	)
		fail("INVALID_INPUT", "Invalid diff cursor");
	return limit;
}

async function checksum(payload: string): Promise<string> {
	return Buffer.from(
		await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload))
	).toString("hex");
}

async function encodeCursor(
	from: string | null,
	to: string,
	path: string
): Promise<string> {
	const payload = JSON.stringify([1, from, to, path]);
	return Buffer.from(
		JSON.stringify([payload, await checksum(payload)])
	).toString("base64url");
}

async function decodeCursor(
	cursor: string | undefined,
	from: string | null,
	to: string,
	fail: DiffSource["fail"]
): Promise<string> {
	if (cursor === undefined) return "";
	try {
		if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("encoding");
		const envelope: unknown = JSON.parse(
			Buffer.from(cursor, "base64url").toString()
		);
		if (
			!Array.isArray(envelope) ||
			envelope.length !== 2 ||
			typeof envelope[0] !== "string" ||
			envelope[1] !== (await checksum(envelope[0]))
		)
			throw new Error("checksum");
		const value: unknown = JSON.parse(envelope[0]);
		if (
			!Array.isArray(value) ||
			value.length !== 4 ||
			value[0] !== 1 ||
			value[1] !== from ||
			value[2] !== to ||
			typeof value[3] !== "string" ||
			!/^(?:[0-9a-f]{2})+$/.test(value[3]) ||
			value[3].length > MAX_PATH_BYTES * 2
		)
			throw new Error("pair");
		return value[3];
	} catch {
		return fail(
			"INVALID_INPUT",
			"Invalid diff cursor or different resolved from/to pair"
		);
	}
}

type Task = {
	path: string;
	old?: DiffTreeEntry;
	next?: DiffTreeEntry;
	depth: number;
};
const cost = (task: Task): number => task.path.length * 2 + 768;
const isTree = (entry: DiffTreeEntry | undefined): boolean =>
	entry?.mode === "40000";

/**
 * Compare snapshots with hash pruning and an exclusive raw-path continuation.
 * Adapted from Eric Clemmons's MR !410 (45827987, 536f4033, 835ef2c9),
 * packages/gitty-js/src/diff.ts and RepoContentReader.changedPaths. This walk
 * adds resumable pages, file/directory replacement handling and type changes.
 *
 * @param source Bounded object reads and public error translation.
 * @param from Original ref, or null for an empty tree.
 * @param to Destination ref.
 * @param opts Page size and opaque continuation.
 * @returns At most limit entries; never calculates a total or materializes the full diff.
 */
export async function diffSnapshots(
	source: DiffSource,
	from: string | null,
	to: string,
	opts?: ArtifactsDiffOptions
): Promise<ArtifactsDiffResult> {
	const limit = validateDiffInput(from, to, opts, source.fail);
	const before = from === null ? null : await source.resolve(from, "from");
	const after = await source.resolve(to, "to");
	const last = await decodeCursor(
		opts?.cursor,
		before?.hash ?? null,
		after.hash,
		source.fail
	);
	const result: ArtifactsDiffResult = {
		from: before?.hash ?? null,
		to: after.hash,
		changes: [],
	};
	const stack: Task[] = [];
	let pendingBytes = 0;
	let lastReturned = "";

	const enqueueTree = async (
		oldHash: string | undefined,
		newHash: string | undefined,
		prefix: string,
		depth: number
	): Promise<void> => {
		if (oldHash === newHash) return;
		if (depth > MAX_DEPTH)
			source.fail("MEMORY_LIMIT", "Diff tree depth exceeds its memory budget");
		// Each side is capped before parsing; this map is at most two tree objects.
		const tasks = new Map<string, Task>();
		for (const [side, hash] of [
			["old", oldHash],
			["next", newHash],
		] as const) {
			if (hash === undefined) continue;
			for (const entry of await source.tree(hash)) {
				const path = prefix + entry.name + (isTree(entry) ? "2f" : "");
				if (path.length > MAX_PATH_BYTES * 2)
					source.fail("MEMORY_LIMIT", "Diff path exceeds its memory budget");
				// Seek directly to the cursor's subtree; earlier subtrees are not read.
				if (path <= last && !(isTree(entry) && last.startsWith(path))) continue;
				let task = tasks.get(path);
				if (!task) {
					task = { path, depth };
					pendingBytes += cost(task);
					if (pendingBytes > MAX_PENDING_BYTES)
						source.fail(
							"MEMORY_LIMIT",
							"Diff frontier exceeds its memory budget"
						);
					tasks.set(path, task);
				}
				task[side] = entry;
			}
		}
		// A trailing slash orders subtrees among sibling files, including a file
		// replaced by a directory ("a", "a.txt", "a/child"). Hex preserves byte order.
		stack.push(
			...Array.from(tasks.values()).sort((left, right) =>
				left.path < right.path ? 1 : left.path > right.path ? -1 : 0
			)
		);
	};

	await enqueueTree(before?.tree, after.tree, "", 0);
	while (stack.length) {
		const task = stack.pop();
		if (!task) break;
		pendingBytes -= cost(task);
		if (
			task.old?.hash === task.next?.hash &&
			task.old?.mode === task.next?.mode
		)
			continue;
		if (isTree(task.old) || isTree(task.next)) {
			await enqueueTree(
				task.old?.hash,
				task.next?.hash,
				task.path,
				task.depth + 1
			);
			continue;
		}
		if (result.changes.length === limit) {
			result.cursor = await encodeCursor(result.from, result.to, lastReturned);
			return result;
		}
		const status = !task.old
			? "added"
			: !task.next
				? "deleted"
				: (parseInt(task.old.mode, 8) & 0o170000) !==
					  (parseInt(task.next.mode, 8) & 0o170000)
					? "type_changed"
					: "modified";
		result.changes.push({
			path: Buffer.from(task.path, "hex").toString("utf8"),
			status,
			...(task.old ? { oldMode: task.old.mode, oldHash: task.old.hash } : {}),
			...(task.next
				? { newMode: task.next.mode, newHash: task.next.hash }
				: {}),
		});
		lastReturned = task.path;
	}
	return result;
}
