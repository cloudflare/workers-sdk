/* Shared observable scenarios. No HTTP RPC shim: calls use the real Worker binding. */
export interface Repository {
	info(): Promise<unknown>;
	createToken(
		scope?: "read" | "write",
		ttl?: number
	): Promise<{ id: string; plaintext: string }>;
	listTokens(): Promise<unknown>;
	revokeToken(tokenOrId: string): Promise<boolean>;
	readBlob(hash: string): Promise<Blob | null>;
	readTree(hash: string): Promise<Array<{ name: string; hash: string }> | null>;
	readCommit(hash: string): Promise<{ treeHash: string } | null>;
	readFile(args: { ref: string; path: string }): Promise<Blob | null>;
	log(options?: {
		ref?: string;
		limit?: number;
		offset?: number;
	}): Promise<Array<{ hash: string; treeHash: string }>>;
	fork(
		name: string,
		options?: {
			readOnly?: boolean;
			defaultBranchOnly?: boolean;
			description?: string;
		}
	): Promise<Created>;
}

export interface Created {
	id: string;
	name: string;
	remote: string;
	token: string;
}

export interface ArtifactsBinding {
	create(
		name: string,
		options?: { readOnly?: boolean; description?: string }
	): Promise<Created>;
	get(name: string): Promise<Repository>;
	list(options?: { limit?: number; cursor?: string }): Promise<{
		repos: Array<{ name: string }>;
		total: number;
		cursor?: string;
	}>;
	delete(name: string): Promise<boolean>;
}

export type Observation = {
	step: string;
	outcome: "value" | "error";
	value: unknown;
};
export type PrepareFixture = (created: Created) => Promise<void>;

/** Execute a bounded, namespace-scoped set of RPC calls and capture their exact outcomes. */
export async function runScenarios(
	binding: ArtifactsBinding,
	prefix: string,
	prepareFixture: PrepareFixture
): Promise<Observation[]> {
	if (!/^[a-z][a-z0-9-]{7,40}-$/.test(prefix)) {
		throw new Error(
			"Fixture prefix must be lowercase, 8–41 characters, and end with '-'"
		);
	}
	const names = [
		"main",
		"second",
		"third",
		"fork",
		"all",
		"readonly",
		"reused",
	].map((suffix) => prefix + suffix);
	// The namespace must be empty: global list totals/cursors are otherwise affected
	// by repositories outside this fixture, and cleanup must never touch them.
	const seenCursors = new Set<string>();
	let cursor: string | undefined;
	do {
		const page = await binding.list({
			limit: 200,
			...(cursor ? { cursor } : {}),
		});
		if (page.repos.length || page.total !== 0) {
			throw new Error("Disposable fixture namespace is not empty");
		}
		cursor = page.cursor;
		if (cursor && seenCursors.has(cursor)) {
			throw new Error("Fixture preflight pagination repeated a cursor");
		}
		if (cursor) {
			seenCursors.add(cursor);
		}
	} while (cursor);
	const [main, second, third, fork, all, readonly, reused] = names;
	const observations: Observation[] = [];
	const owned = new Set<string>();
	const recordCreation = async (
		step: string,
		name: string,
		call: () => Promise<Created>
	): Promise<void> => {
		await record(step, async () => {
			const created = await call();
			owned.add(name);
			return created;
		});
	};
	const record = async (
		step: string,
		call: () => Promise<unknown>
	): Promise<void> => {
		try {
			observations.push({
				step,
				outcome: "value",
				value: await snapshot(await call()),
			});
		} catch (error) {
			observations.push({
				step,
				outcome: "error",
				value: errorSnapshot(error),
			});
		}
	};
	// Only successfully created fixtures belong to this run. Failed RPC calls
	// may have unknown effects; never assume a failed create grants ownership.
	let scenarioFailure: { error: unknown } | undefined;
	try {
		await record("empty list", () => binding.list({ limit: 1 }));
		await record("invalid name", async () =>
			(await binding.get(prefix + "invalid/name")).info()
		);
		await record("missing get info", async () =>
			(await binding.get(prefix + "absent")).info()
		);
		await record("missing delete", () => binding.delete(prefix + "absent"));
		await recordCreation("create", main, () =>
			binding.create(main, { description: "contract fixture" })
		);
		await recordCreation("duplicate case", main.toUpperCase(), () =>
			binding.create(main.toUpperCase())
		);
		await record("case get", async () =>
			(await binding.get(main.toUpperCase())).info()
		);
		await recordCreation("create second", second, () => binding.create(second));
		await recordCreation("create third", third, () => binding.create(third));
		await record("list first page", () => binding.list({ limit: 2 }));
		const page = await binding.list({ limit: 2 });
		await record("list next page", () =>
			binding.list({ limit: 2, cursor: page.cursor })
		);
		await record("list limit zero", () => binding.list({ limit: 0 }));
		await record("list limit high", () => binding.list({ limit: 201 }));
		await record("list malformed cursor", () =>
			binding.list({ limit: 1, cursor: "not-base64!" })
		);
		const retained = await binding.get(second);
		await record("delete retained", () => binding.delete(second));
		await record("retained after delete", () => retained.info());
		await recordCreation("recreate retained", second, () =>
			binding.create(second)
		);
		await record("retained after recreate", () => retained.info());
		await record("delete case", () => binding.delete(third.toUpperCase()));
		await record("delete twice", () => binding.delete(third));
		const repo = await binding.get(main);
		await record("token list initial", () => repo.listTokens());
		let readToken: { id: string; plaintext: string } | undefined;
		await record(
			"token create read",
			async () => (readToken = await repo.createToken("read", 60))
		);
		await record("token list read", () => repo.listTokens());
		await record("token ttl low", () => repo.createToken("write", 59));
		await record("token ttl high", () => repo.createToken("write", 31_536_001));
		if (!readToken) {
			throw new Error("Could not create fixture read token");
		}
		const tokenId = readToken.id;
		await record("token revoke wrong repo", async () =>
			(await binding.get(second)).revokeToken(tokenId)
		);
		await record("token revoke", () => repo.revokeToken(tokenId));
		await record("token revoke twice", () => repo.revokeToken(tokenId));
		await record("token list revoked", () => repo.listTokens());
		await record("token invalid id", () => repo.revokeToken("bad"));
		await recordCreation("fork empty", fork, async () =>
			(await binding.get(second)).fork(fork)
		);
		await recordCreation("fork duplicate case", fork.toUpperCase(), async () =>
			(await binding.get(second)).fork(fork.toUpperCase())
		);
		await recordCreation("fork read only", readonly, async () =>
			(await binding.get(second)).fork(readonly, { readOnly: true })
		);
		await recordCreation("fork missing source", reused, async () =>
			(await binding.get(prefix + "absent")).fork(reused)
		);
		const created = (await repo.info()) as Created;
		// The initial create token is only returned by create, not info; prepare via a fresh token.
		const write = await repo.createToken("write");
		await prepareFixture({ ...created, token: write.plaintext });
		const log = await repo.log({ ref: "main" });
		await record("log main", () => repo.log({ ref: "main" }));
		await record("log page", () =>
			repo.log({ ref: "main", limit: 1, offset: 1 })
		);
		await record("log invalid limit", () => repo.log({ limit: 0 }));
		await record("log missing ref", () => repo.log({ ref: "missing" }));
		const hash = log[0]?.hash;
		if (!hash) {
			throw new Error("Fixture push did not produce a main commit");
		}
		const commit = await repo.readCommit(hash);
		if (!commit) {
			throw new Error("Fixture main commit is missing");
		}
		const tree = await repo.readTree(commit.treeHash);
		if (!tree) {
			throw new Error("Fixture main tree is missing");
		}
		const blob = tree.find((entry) => entry.name === "hello.txt")?.hash;
		if (!blob) {
			throw new Error("Fixture hello.txt blob is missing");
		}
		const missingHash = "0".repeat(40);
		for (const [kind, read, wrong] of [
			["blob", (h: string) => repo.readBlob(h), commit.treeHash],
			["tree", (h: string) => repo.readTree(h), blob],
			["commit", (h: string) => repo.readCommit(h), blob],
		] as const) {
			await record(`${kind} present`, () =>
				read(kind === "blob" ? blob : kind === "tree" ? commit.treeHash : hash)
			);
			await record(`${kind} missing`, () => read(missingHash));
			await record(`${kind} invalid hash`, () => read("bad"));
			await record(`${kind} wrong type`, () => read(wrong));
		}
		for (const [label, ref, path] of [
			["text", "main", "hello.txt"],
			["binary", "main", "bytes.bin"],
			["nested", "main", "folder/nested.txt"],
			["directory", "main", "folder"],
			["missing path", "main", "absent"],
			["traversal", "main", "../hello.txt"],
			["missing ref", "missing", "hello.txt"],
			["commit ref", hash, "hello.txt"],
		] as const) {
			await record(`file ${label}`, () => repo.readFile({ ref, path }));
		}
		await record("file invalid path", () =>
			repo.readFile({ ref: "main", path: "" })
		);
		await recordCreation("fork main only", reused, () =>
			repo.fork(reused, { defaultBranchOnly: true })
		);
		await recordCreation("fork all refs", all, () =>
			repo.fork(all, { defaultBranchOnly: false, description: "all refs" })
		);
		await record("fork main feature", async () =>
			(await binding.get(reused)).readFile({
				ref: "feature",
				path: "feature.txt",
			})
		);
		await record("fork all feature", async () =>
			(await binding.get(all)).readFile({ ref: "feature", path: "feature.txt" })
		);
	} catch (error) {
		scenarioFailure = { error };
	}
	const cleanupFailures: string[] = [];
	for (const name of owned) {
		try {
			await binding.delete(name);
		} catch {
			cleanupFailures.push(name);
		}
	}
	if (cleanupFailures.length) {
		throw new Error(
			`Fixture cleanup failed for: ${cleanupFailures.join(", ")}`,
			{ cause: scenarioFailure?.error }
		);
	}
	if (scenarioFailure) {
		throw scenarioFailure.error;
	}
	return observations;
}

function errorSnapshot(error: unknown): unknown {
	if (error === null || typeof error !== "object") {
		return { thrown: String(error) };
	}
	return Object.fromEntries(
		["name", "message", "code", "numericCode"]
			.filter((key) => key in error)
			.map((key) => [key, (error as Record<string, unknown>)[key]])
	);
}

async function snapshot(value: unknown): Promise<unknown> {
	if (value instanceof Blob) {
		return {
			blob: {
				type: value.type,
				bytes: [...new Uint8Array(await value.arrayBuffer())],
			},
		};
	}
	if (Array.isArray(value)) {
		return Promise.all(value.map(snapshot));
	}
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			await Promise.all(
				Object.entries(value).map(async ([key, item]) => [
					key,
					await snapshot(item),
				])
			)
		);
	}
	return value === undefined ? { undefined: true } : value;
}
