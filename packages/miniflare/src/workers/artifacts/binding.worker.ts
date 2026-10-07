import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";

const repoName = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

type TokenScope = "read" | "write";

type RepositorySource =
	| { type: "fork"; repository: string }
	| { type: "remote"; url: string };

interface RepositoryOptions {
	description?: string | undefined;
	readOnly?: boolean;
	setDefaultBranch?: string;
}

interface ForkOptions {
	description?: string;
	readOnly?: boolean;
	defaultBranchOnly?: boolean;
}

interface ImportRepositoryOptions {
	source: { url: string; branch?: string; depth?: number };
	target: { name: string; opts?: { description?: string; readOnly?: boolean } };
}

interface RepositoryToken {
	id: string;
	tokenHash: string;
	scope: TokenScope;
	createdAt: string;
	expiresAt: string;
	revokedAt?: string;
}

interface CreatedToken {
	record: RepositoryToken;
	plaintext: string;
}

interface Repository {
	id: string;
	name: string;
	namespace: string;
	description?: string | undefined;
	readOnly: boolean;
	defaultBranch: string;
	remote: string;
	source?: RepositorySource | undefined;
	createdAt: string;
	updatedAt: string;
	lastPushAt?: string | undefined;
	tokens: RepositoryToken[];
}

interface RepositoryMetadata {
	id: string;
	name: string;
	remote: string;
	defaultBranch: string;
	description: string | null;
	source: string | null;
	readOnly: boolean;
	createdAt: string;
	updatedAt: string;
	lastPushAt: string | null;
}

interface CreateRepositoryResult {
	id: string;
	name: string;
	description: string | null;
	defaultBranch: string;
	remote: string;
	token: string;
}

interface CreateTokenResult {
	id: string;
	plaintext: string;
	scope: TokenScope;
	expiresAt: string;
}
type TokenInfo = Omit<RepositoryToken, "tokenHash" | "revokedAt"> & {
	state: "active" | "expired" | "revoked";
};

interface RepositoryListOptions {
	cursor?: string;
	limit?: number;
}

type RepositoryListResult = {
	repos: Array<
		RepositoryMetadata & { status: "ready"; jurisdiction: "unrestricted" }
	>;
	total: number;
	cursor?: string;
};

interface RepositoryLogOptions {
	ref?: string;
	limit?: number;
	offset?: number;
}

interface BackendState {
	defaultBranch: string;
	refs: Record<string, string>;
}

type BackendRequest =
	| { action: "create"; defaultBranch: string }
	| { action: "delete" }
	| {
			action: "fork";
			sourceName: string;
			sourceBranch: string;
			defaultBranchOnly?: boolean;
	  }
	| { action: "import"; sourceUrl: string; branch?: string; depth?: number }
	| { action: "refs" }
	| { action: "readBlob"; hash: string }
	| { action: "readTree"; hash: string }
	| { action: "readCommit"; hash: string }
	| { action: "file"; ref: string; path: string }
	| { action: "log"; ref?: string; limit?: number; offset?: number };

interface TreeEntry {
	name: string;
	mode: string;
	hash: string;
	type: "tree" | "blob" | "symlink" | "gitlink" | "exec";
}

interface CommitMetadata {
	hash: string;
	treeHash: string;
	message: string;
	author: { name: string; email: string };
	committer: { name: string; email: string };
	parents: string[];
	authoredAt: number;
	committedAt: number;
}

interface LocalArtifactsRepo {
	info(): Promise<RepositoryMetadata>;
	createToken(scope?: TokenScope, ttl?: number): Promise<CreateTokenResult>;
	listTokens(): Promise<{ total: number; tokens: TokenInfo[] }>;
	revokeToken(tokenOrId: string): Promise<boolean>;
	readBlob(hash: string): Promise<Blob | null>;
	readTree(hash: string): Promise<TreeEntry[] | null>;
	readCommit(hash: string): Promise<CommitMetadata | null>;
	readFile(args: { ref: string; path: string }): Promise<Blob | null>;
	log(options?: RepositoryLogOptions): Promise<CommitMetadata[]>;
	fork(name: string, options?: ForkOptions): Promise<CreateRepositoryResult>;
}

interface BackendBlob {
	data: string;
}

type ArtifactsErrorCode =
	| "ALREADY_EXISTS"
	| "NOT_FOUND"
	| "INVALID_INPUT"
	| "INVALID_REPO_NAME"
	| "INVALID_TTL"
	| "INVALID_URL"
	| "REMOTE_AUTH_REQUIRED"
	| "MEMORY_LIMIT"
	| "UPSTREAM_UNAVAILABLE"
	| "INTERNAL_ERROR";

const numericCodes: Record<ArtifactsErrorCode, number> = {
	INVALID_INPUT: 10100,
	INVALID_REPO_NAME: 10101,
	INVALID_TTL: 10103,
	INVALID_URL: 10104,
	REMOTE_AUTH_REQUIRED: 10106,
	NOT_FOUND: 10200,
	ALREADY_EXISTS: 10201,
	INTERNAL_ERROR: 10400,
	UPSTREAM_UNAVAILABLE: 10401,
	MEMORY_LIMIT: 10402,
};

class ArtifactsError extends Error {
	readonly code: ArtifactsErrorCode;
	readonly numericCode: number;

	constructor(code: ArtifactsErrorCode, message: string) {
		super(message);
		this.name = "ArtifactsError";
		this.code = code;
		this.numericCode = numericCodes[code];
	}
}

interface LocalArtifactsEnvironment {
	config: { namespace: string; origin: string };
	localArtifactsNamespace: DurableObjectNamespace<LocalArtifactsNamespaceObject>;
	gitBackend: Fetcher;
}

type RepositoryMap = Record<string, Repository>;

export class LocalArtifactsNamespace extends WorkerEntrypoint<LocalArtifactsEnvironment> {
	async create(
		name: string,
		options: RepositoryOptions = {}
	): Promise<CreateRepositoryResult> {
		return publicCall(() => this.#namespace().create(name, options));
	}

	async get(name: string): Promise<LocalArtifactsRepo> {
		const repository = await publicCall(() => this.#namespace().get(name));
		return repository as unknown as LocalArtifactsRepo;
	}

	async import(
		options: ImportRepositoryOptions
	): Promise<CreateRepositoryResult> {
		return publicCall(() => this.#namespace().import(options));
	}

	async list(
		options: RepositoryListOptions = {}
	): Promise<RepositoryListResult> {
		return publicCall(() => this.#namespace().list(options));
	}

	async delete(name: string): Promise<boolean> {
		return publicCall(() => this.#namespace().delete(name));
	}

	override async fetch(request: Request): Promise<Response> {
		return this.#namespace().fetch(request);
	}

	#namespace(): DurableObjectStub<LocalArtifactsNamespaceObject> {
		const { localArtifactsNamespace, config } = this.env;
		return localArtifactsNamespace.get(
			localArtifactsNamespace.idFromName(config.namespace)
		);
	}
}

export class LocalArtifactsNamespaceObject extends DurableObject<LocalArtifactsEnvironment> {
	// The resolved tail lets the first mutation run immediately. exclusive()
	// serializes subsequent metadata and backend mutations across awaits.
	private operations = Promise.resolve();

	async create(
		name: string,
		options: RepositoryOptions = {}
	): Promise<CreateRepositoryResult> {
		return this.exclusive(async () => {
			validateName(name);
			validateRepositoryOptions(options);
			const repositories = await this.repos();
			if (hasRepository(repositories, name)) {
				throw new ArtifactsError(
					"ALREADY_EXISTS",
					`repo already exists: ${name}`
				);
			}

			const repository = makeRepo(
				name,
				this.env.config.namespace,
				this.env.config.origin,
				options
			);
			try {
				const state = await this.backend<BackendState>(repository, {
					action: "create",
					defaultBranch: repository.defaultBranch,
				});
				applyBackendState(repository, state);
				repositories[name.toLowerCase()] = repository;
				const token = await createToken(repository, "write");
				try {
					await this.saveRepos(repositories);
				} catch {
					await this.deleteBackend(repository);
					throw new ArtifactsError(
						"INTERNAL_ERROR",
						"Unable to persist Artifacts repository"
					);
				}
				return createRepoResult(repository, token);
			} catch (error) {
				if (error instanceof ArtifactsError) {
					throw error;
				}
				throw new ArtifactsError(
					"INTERNAL_ERROR",
					"Unable to create Artifacts repository"
				);
			}
		});
	}

	async get(name: string): Promise<LocalArtifactsRepo> {
		validateName(name);
		const repository = await this.getRepo(name);
		return createRepoHandle(this, repository.name);
	}

	async import(
		options: ImportRepositoryOptions
	): Promise<CreateRepositoryResult> {
		return this.exclusive(async () => {
			const { source, target, sourceUrl } = parseImportRequest(options);
			const repositories = await this.repos();
			if (hasRepository(repositories, target.name)) {
				throw new ArtifactsError(
					"ALREADY_EXISTS",
					`repo already exists: ${target.name}`
				);
			}
			validateRepositoryOptions(target.opts ?? {});
			const repository = makeRepo(
				target.name,
				this.env.config.namespace,
				this.env.config.origin,
				target.opts ?? {}
			);
			// The clone URL may contain one-time credentials. Keep them out of
			// repository metadata returned by info() and persisted in storage.
			const publicSourceUrl = new URL(sourceUrl);
			publicSourceUrl.username = "";
			publicSourceUrl.password = "";
			publicSourceUrl.search = "";
			publicSourceUrl.hash = "";
			repository.source = { type: "remote", url: publicSourceUrl.href };
			const state = await this.backend<BackendState>(repository, {
				action: "import",
				sourceUrl: sourceUrl.href,
				...(source.branch === undefined ? {} : { branch: source.branch }),
				...(source.depth === undefined ? {} : { depth: source.depth }),
			});
			applyBackendState(repository, state);
			repository.updatedAt = new Date().toISOString();
			const token = await createToken(repository, "write");
			repositories[repository.name.toLowerCase()] = repository;
			try {
				await this.saveRepos(repositories);
			} catch {
				await this.deleteBackend(repository);
				throw new ArtifactsError(
					"INTERNAL_ERROR",
					"Unable to persist imported Artifacts repository"
				);
			}
			return createRepoResult(repository, token);
		});
	}

	async list(
		options: RepositoryListOptions = {}
	): Promise<RepositoryListResult> {
		const limit = options.limit ?? 50;
		if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
			throw new ArtifactsError(
				"INVALID_INPUT",
				"Invalid limit: must be between 1 and 200."
			);
		}
		const offset = decodeCursor(options.cursor);
		const repositories = Object.values(await this.repos()).sort((left, right) =>
			right.createdAt.localeCompare(left.createdAt)
		);
		const page = repositories
			.slice(offset, offset + limit)
			.map((repository) => ({
				...repoMetadata(repository),
				status: "ready" as const,
				// Local storage has no placement jurisdiction; this is the public default.
				jurisdiction: "unrestricted" as const,
			}));
		const cursor =
			offset + page.length < repositories.length
				? encodeCursor(offset + page.length)
				: undefined;
		return {
			repos: page,
			total: repositories.length,
			...(cursor === undefined ? {} : { cursor }),
		};
	}

	async delete(name: string): Promise<boolean> {
		return this.exclusive(async () => {
			validateName(name);
			const repositories = await this.repos();
			if (!hasRepository(repositories, name)) {
				return false;
			}
			const repository = getRepo(repositories, name);
			await this.backend(repository, { action: "delete" });
			delete repositories[name.toLowerCase()];
			await this.saveRepos(repositories);
			return true;
		});
	}

	async createToken(
		name: string,
		scope: TokenScope = "write",
		ttl?: number
	): Promise<CreateTokenResult> {
		return this.exclusive(async () => {
			const repositories = await this.repos();
			const repository = getRepo(repositories, name);
			const token = await createToken(repository, scope, ttl);
			await this.saveRepos(repositories);
			return tokenResult(token);
		});
	}

	async listTokens(
		name: string
	): Promise<{ total: number; tokens: TokenInfo[] }> {
		const repository = await this.getRepo(name);
		const active = repository.tokens.filter(
			(token) => !token.revokedAt && isActive(token)
		);
		const tokens = active
			.toReversed()
			.slice(0, 30)
			.map(({ tokenHash: _tokenHash, revokedAt: _revokedAt, ...token }) => ({
				...token,
				state: "active" as const,
			}));
		return { total: active.length, tokens };
	}

	async revokeToken(name: string, tokenOrId: string): Promise<boolean> {
		return this.exclusive(async () => {
			if (!isTokenId(tokenOrId) && !isArtifactToken(tokenOrId)) {
				throw new ArtifactsError(
					"INVALID_INPUT",
					"Invalid tokenOrId: must be a token id or artifact token."
				);
			}
			const repositories = await this.repos();
			const repository = getRepo(repositories, name);
			const tokenHash = isArtifactToken(tokenOrId)
				? await hashToken(tokenOrId)
				: undefined;
			const token = repository.tokens.find(
				(candidate) =>
					candidate.id === tokenOrId ||
					(tokenHash !== undefined &&
						constantTimeEqual(candidate.tokenHash, tokenHash))
			);
			if (!token || token.revokedAt) {
				return false;
			}
			token.revokedAt = new Date().toISOString();
			await this.saveRepos(repositories);
			return true;
		});
	}

	async fork(
		sourceName: string,
		name: string,
		options: ForkOptions = {}
	): Promise<CreateRepositoryResult> {
		return this.exclusive(async () => {
			validateName(name);
			validateRepositoryOptions(options);
			const repositories = await this.repos();
			const source = getRepo(repositories, sourceName);
			if (hasRepository(repositories, name)) {
				throw new ArtifactsError(
					"ALREADY_EXISTS",
					`repo already exists: ${name}`
				);
			}
			const fork = makeRepo(
				name,
				this.env.config.namespace,
				this.env.config.origin,
				options
			);
			let state: BackendState;
			try {
				state = await this.backend<BackendState>(fork, {
					action: "fork",
					sourceName: source.name,
					sourceBranch: source.defaultBranch,
					...(options.defaultBranchOnly === undefined
						? {}
						: { defaultBranchOnly: options.defaultBranchOnly }),
				});
			} catch {
				throw new ArtifactsError(
					"INTERNAL_ERROR",
					"Unable to fork Artifacts repository"
				);
			}
			applyBackendState(fork, state);
			fork.source = { type: "fork", repository: source.name };
			const token = await createToken(fork, "write");
			repositories[name.toLowerCase()] = fork;
			try {
				await this.saveRepos(repositories);
			} catch {
				await this.deleteBackend(fork);
				throw new ArtifactsError(
					"INTERNAL_ERROR",
					"Unable to persist forked Artifacts repository"
				);
			}
			return createRepoResult(fork, token);
		});
	}

	override async fetch(request: Request): Promise<Response> {
		return handleGitRequest(this, this.env.config.namespace, request);
	}

	async repos(): Promise<RepositoryMap> {
		const repositories =
			(await this.ctx.storage.get<RepositoryMap>("repos")) ??
			(Object.create(null) as RepositoryMap);
		// The local Git listener can move after a process restart.
		for (const repository of Object.values(repositories)) {
			repository.remote = `${this.env.config.origin}/git/${repository.namespace}/${repository.name}.git`;
		}
		return repositories;
	}

	saveRepos(repositories: RepositoryMap): Promise<void> {
		return this.ctx.storage.put("repos", repositories);
	}

	async getRepo(name: string): Promise<Repository> {
		return getRepo(await this.repos(), name);
	}

	async backend<T = unknown>(
		repository: Repository,
		request: BackendRequest
	): Promise<T> {
		const response = await this.env.gitBackend.fetch(
			"http://local-artifacts-backend/__local_artifacts__",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...request,
					namespace: repository.namespace,
					name: repository.name,
					generation: repository.id,
				}),
			}
		);
		if (!response.ok) {
			const message = await response.text();
			if (request.action === "import") {
				throw classifyImportError(message);
			}
			throw new ArtifactsError("INTERNAL_ERROR", "An internal error occurred.");
		}
		return response.json<T>();
	}

	private async deleteBackend(repository: Repository): Promise<void> {
		try {
			await this.backend(repository, { action: "delete" });
		} catch {
			// Preserve the original persistence error; native delete is idempotent on retry.
		}
	}

	gitFetch(repository: Repository, request: Request): Promise<Response> {
		const headers = new Headers(request.headers);
		headers.delete("Authorization");
		headers.set("X-Local-Artifacts-Generation", repository.id);
		const url = new URL(request.url);
		url.pathname = url.pathname.replace(
			/^\/git\/[^/]+\/[^/]+\.git/,
			`/git/${repository.namespace}/${repository.name}.git`
		);
		return this.env.gitBackend.fetch(
			new Request(url, new Request(request, { headers }))
		);
	}

	async syncAfterPush(
		name: string,
		previousRefs: Record<string, string>
	): Promise<void> {
		await this.exclusive(async () => {
			const repositories = await this.repos();
			const repository = getRepo(repositories, name);
			const state = await this.backend<BackendState>(repository, {
				action: "refs",
			});
			if (JSON.stringify(state.refs) !== JSON.stringify(previousRefs)) {
				repository.updatedAt = new Date().toISOString();
				repository.lastPushAt = repository.updatedAt;
			}
			await this.saveRepos(repositories);
		});
	}

	private async exclusive<T>(action: () => Promise<T>): Promise<T> {
		const previous = this.operations;
		let release!: () => void;
		this.operations = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		try {
			return await action();
		} finally {
			release();
		}
	}
}

function createRepoHandle(
	namespace: LocalArtifactsNamespaceObject,
	name: string
): LocalArtifactsRepo {
	const read = <T>(request: BackendRequest): Promise<T> =>
		publicCall(async () =>
			namespace.backend<T>(await namespace.getRepo(name), request)
		);
	const readFile = async (args: {
		ref: string;
		path: string;
	}): Promise<Blob | null> => {
		if (!args?.ref) {
			throw new ArtifactsError("INVALID_INPUT", "Invalid ref: ref required.");
		}
		if (!args?.path) {
			throw new ArtifactsError("INVALID_INPUT", "Invalid path: path required.");
		}
		const path = normalizePath(args.path);
		if (path === null) {
			return null;
		}
		const result = await read<BackendBlob | null>({
			action: "file",
			ref: args.ref,
			path,
		});
		if (result === null) {
			return null;
		}
		const bytes = decodeBase64(result.data);
		return new Blob([bytes], { type: contentType(args.path, bytes) });
	};

	return {
		info: () =>
			publicCall(async () => repoMetadata(await namespace.getRepo(name))),
		createToken: (scope: TokenScope = "write", ttl?: number) =>
			publicCall(() => namespace.createToken(name, scope, ttl)),
		listTokens: () => publicCall(() => namespace.listTokens(name)),
		revokeToken: (tokenOrId: string) =>
			publicCall(() => namespace.revokeToken(name, tokenOrId)),
		readBlob: async (hash: string) => {
			validateHash(hash);
			const result = await read<BackendBlob | null>({
				action: "readBlob",
				hash,
			});
			return result === null ? null : new Blob([decodeBase64(result.data)]);
		},
		readTree: async (hash: string) => {
			validateHash(hash);
			return await read({ action: "readTree", hash });
		},
		readCommit: async (hash: string) => {
			validateHash(hash);
			return await read({ action: "readCommit", hash });
		},
		readFile,
		log: (options: RepositoryLogOptions = {}) => {
			validateLogOptions(options);
			return read({
				action: "log",
				...(options.ref === undefined ? {} : { ref: options.ref }),
				...(options.limit === undefined ? {} : { limit: options.limit }),
				...(options.offset === undefined ? {} : { offset: options.offset }),
			});
		},
		fork: (targetName: string, options: ForkOptions = {}) =>
			publicCall(() => namespace.fork(name, targetName, options)),
	};
}

function parseGitRoute(
	request: Request,
	namespace: string
): { name: string; write: boolean; push: boolean } | null {
	const url = new URL(request.url);
	const match = url.pathname.match(/^\/git\/([^/]+)\/([^/]+)\.git(?:\/(.*))?$/);
	if (!match || match[1] !== namespace || !match[2]) {
		return null;
	}
	const path = match[3] ?? "";
	const service = url.searchParams.get("service");
	const discovery =
		request.method === "GET" &&
		path === "info/refs" &&
		(service === "git-upload-pack" || service === "git-receive-pack");
	const pack =
		request.method === "POST" &&
		(path === "git-upload-pack" || path === "git-receive-pack");
	if (!discovery && !pack) {
		return null;
	}
	return {
		name: match[2],
		write: path === "git-receive-pack" || service === "git-receive-pack",
		push: request.method === "POST" && path === "git-receive-pack",
	};
}

async function handleGitRequest(
	state: LocalArtifactsNamespaceObject,
	namespace: string,
	request: Request
): Promise<Response> {
	const route = parseGitRoute(request, namespace);
	if (!route) {
		return new Response("Not found", { status: 404 });
	}
	let repository: Repository;
	try {
		repository = await state.getRepo(route.name);
	} catch (error) {
		if (error instanceof ArtifactsError && error.code === "NOT_FOUND") {
			return new Response("Not found", { status: 404 });
		}
		throw error;
	}
	const authorizationError = await authorize(
		repository,
		request,
		route.write ? "write" : "read"
	);
	if (authorizationError) {
		return authorizationError;
	}
	if (route.write && repository.readOnly) {
		return new Response("Artifacts repository is read-only", { status: 403 });
	}

	const previousRefs = route.push
		? (await state.backend<BackendState>(repository, { action: "refs" })).refs
		: undefined;
	const response = await state.gitFetch(repository, request);
	if (!previousRefs) {
		return response;
	}

	const body = await response.arrayBuffer();
	if (response.ok) {
		try {
			await state.syncAfterPush(repository.name, previousRefs);
		} catch {
			// Git has already accepted the push; metadata bookkeeping must not fail the client request.
		}
	}
	return new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
}

async function authorize(
	repository: Repository,
	request: Request,
	scope: TokenScope
): Promise<Response | undefined> {
	const header = request.headers.get("Authorization") ?? "";
	let value = "";
	if (header.startsWith("Bearer ")) {
		value = header.slice(7);
	} else if (header.startsWith("Basic ")) {
		try {
			value = atob(header.slice(6)).split(":").slice(1).join(":");
		} catch {
			value = "";
		}
	}
	const valueHash = await hashToken(value);
	const token = repository.tokens.find(
		(candidate) =>
			!candidate.revokedAt &&
			constantTimeEqual(candidate.tokenHash, valueHash) &&
			isActive(candidate)
	);
	if (!token) {
		return new Response("Invalid Artifacts token", {
			status: 401,
			headers: { "WWW-Authenticate": 'Basic realm="Artifacts"' },
		});
	}
	if (scope === "write" && token.scope !== "write") {
		return new Response("Artifacts token requires write scope", {
			status: 403,
		});
	}
	return undefined;
}

function applyBackendState(repository: Repository, state: BackendState): void {
	repository.defaultBranch = state.defaultBranch;
}

function makeRepo(
	name: string,
	namespace: string,
	origin: string,
	options: RepositoryOptions
): Repository {
	const time = new Date().toISOString();
	return {
		id: randomBase36(16),
		name,
		namespace,
		description: options.description,
		readOnly: Boolean(options.readOnly),
		defaultBranch: options.setDefaultBranch ?? "main",
		remote: `${origin}/git/${namespace}/${name}.git`,
		createdAt: time,
		updatedAt: time,
		lastPushAt: undefined,
		tokens: [],
	};
}

function repoMetadata(repository: Repository): RepositoryMetadata {
	return {
		id: repository.id,
		name: repository.name,
		remote: repository.remote,
		defaultBranch: repository.defaultBranch,
		description: repository.description ?? null,
		source:
			repository.source === undefined
				? null
				: repository.source.type === "fork"
					? `artifacts:${repository.namespace}/${repository.source.repository}`
					: `git:${repository.source.url}`,
		readOnly: repository.readOnly,
		createdAt: repository.createdAt,
		updatedAt: repository.updatedAt,
		lastPushAt: repository.lastPushAt ?? null,
	};
}

function createRepoResult(
	repository: Repository,
	token: CreatedToken
): CreateRepositoryResult {
	return {
		id: repository.id,
		name: repository.name,
		description: repository.description ?? null,
		defaultBranch: repository.defaultBranch,
		remote: repository.remote,
		token: token.plaintext,
	};
}

function tokenResult(token: CreatedToken): CreateTokenResult {
	return {
		id: token.record.id,
		plaintext: token.plaintext,
		scope: token.record.scope,
		expiresAt: token.record.expiresAt,
	};
}

function getRepo(repositories: RepositoryMap, name: string): Repository {
	if (!hasRepository(repositories, name)) {
		throw new ArtifactsError("NOT_FOUND", `Repository not found: ${name}.`);
	}
	return repositories[name.toLowerCase()] as Repository;
}

function hasRepository(repositories: RepositoryMap, name: string): boolean {
	return Object.hasOwn(repositories, name.toLowerCase());
}

function parseImportRequest(options: ImportRepositoryOptions): {
	source: ImportRepositoryOptions["source"];
	target: ImportRepositoryOptions["target"];
	sourceUrl: URL;
} {
	if (!options || typeof options !== "object") {
		throw new ArtifactsError(
			"INVALID_INPUT",
			"Artifacts import options are required"
		);
	}
	const { source, target } = options;
	validateName(target?.name);
	let sourceUrl: URL;
	try {
		sourceUrl = new URL(source?.url);
	} catch {
		throw new ArtifactsError(
			"INVALID_INPUT",
			"Invalid source.url: must be a valid URL."
		);
	}
	if (sourceUrl.protocol !== "https:") {
		throw new ArtifactsError(
			"INVALID_INPUT",
			"Invalid source.url: must be an HTTPS URL."
		);
	}
	return { source, target, sourceUrl };
}

function validateName(name: unknown): asserts name is string {
	if (typeof name !== "string" || !repoName.test(name)) {
		throw new ArtifactsError("INVALID_REPO_NAME", "Invalid repo name.");
	}
}

function validateRepositoryOptions(
	options: RepositoryOptions | ForkOptions
): void {
	if (!options || typeof options !== "object") {
		throw new ArtifactsError(
			"INVALID_INPUT",
			"Artifacts repository options must be an object"
		);
	}
	if (
		options.description !== undefined &&
		typeof options.description !== "string"
	) {
		throw new ArtifactsError(
			"INVALID_INPUT",
			"Artifacts repository description must be a string"
		);
	}
	if (options.readOnly !== undefined && typeof options.readOnly !== "boolean") {
		throw new ArtifactsError(
			"INVALID_INPUT",
			"Artifacts repository readOnly must be a boolean"
		);
	}
	if ("setDefaultBranch" in options && options.setDefaultBranch !== undefined) {
		validateBranch(options.setDefaultBranch);
	}
	if (
		"defaultBranchOnly" in options &&
		options.defaultBranchOnly !== undefined &&
		typeof options.defaultBranchOnly !== "boolean"
	) {
		throw new ArtifactsError(
			"INVALID_INPUT",
			"Artifacts defaultBranchOnly must be a boolean"
		);
	}
}

function validateBranch(branch: unknown): asserts branch is string {
	if (
		typeof branch !== "string" ||
		branch.length < 1 ||
		branch.length > 256 ||
		branch.startsWith("-") ||
		branch.startsWith(".") ||
		branch.endsWith("/") ||
		branch.endsWith(".") ||
		branch.endsWith(".lock") ||
		branch === "@" ||
		branch.includes("..") ||
		branch.includes("//") ||
		branch.includes("@{") ||
		branch.split("/").some((segment) => segment.startsWith(".")) ||
		[...branch].some((character) => character.charCodeAt(0) <= 32) ||
		/[~^:?*[\\]/.test(branch)
	) {
		throw new ArtifactsError(
			"INVALID_INPUT",
			"Artifacts default branch is invalid"
		);
	}
}

function validateLogOptions(
	options: unknown
): asserts options is RepositoryLogOptions {
	if (!options || typeof options !== "object") {
		throw new ArtifactsError(
			"INVALID_INPUT",
			"Artifacts log options must be an object"
		);
	}
	const { ref, limit, offset } = options as RepositoryLogOptions;
	if (ref !== undefined && typeof ref !== "string") {
		throw new ArtifactsError("INVALID_INPUT", "Invalid ref: must be a string.");
	}
	if (
		limit !== undefined &&
		(!Number.isInteger(limit) || limit < 1 || limit > 1000)
	) {
		throw new ArtifactsError(
			"INVALID_INPUT",
			"Invalid limit: must be between 1 and 1000."
		);
	}
	if (offset !== undefined && (!Number.isInteger(offset) || offset < 0)) {
		throw new ArtifactsError(
			"INVALID_INPUT",
			"Invalid offset: must be a non-negative integer."
		);
	}
}

async function createToken(
	repository: Repository,
	scope: TokenScope = "write",
	ttl = 86_400
): Promise<CreatedToken> {
	if (scope !== "read" && scope !== "write") {
		throw new ArtifactsError(
			"INVALID_INPUT",
			"Artifacts token scope must be read or write"
		);
	}
	if (!Number.isInteger(ttl) || ttl < 60 || ttl > 31_536_000) {
		throw new ArtifactsError(
			"INVALID_TTL",
			`Invalid TTL ${ttl}: must be between 60 and 31536000 seconds.`
		);
	}
	const createdAt = new Date();
	const expiresAt = new Date(createdAt.getTime() + ttl * 1000);
	const plaintext = `art_v2_x_${randomHex(20)}?expires=${Math.floor(expiresAt.getTime() / 1000)}`;
	const record = {
		id: randomBase36(16),
		tokenHash: await hashToken(plaintext),
		scope,
		createdAt: createdAt.toISOString(),
		expiresAt: expiresAt.toISOString(),
	};
	repository.tokens.push(record);
	return { record, plaintext };
}

function isActive(token: Pick<RepositoryToken, "expiresAt">): boolean {
	return Date.parse(token.expiresAt) > Date.now();
}

function randomHex(bytes: number): string {
	return [...crypto.getRandomValues(new Uint8Array(bytes))]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

async function hashToken(value: string): Promise<string> {
	const secret = value.split("?", 1)[0] ?? "";
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(secret)
	);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

function constantTimeEqual(left: string, right: string): boolean {
	if (left.length !== right.length) {
		return false;
	}
	let difference = 0;
	for (let index = 0; index < left.length; index++) {
		difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}
	return difference === 0;
}

function randomBase36(length: number): string {
	const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
	return [...crypto.getRandomValues(new Uint8Array(length))]
		.map((byte) => alphabet[byte % alphabet.length])
		.join("");
}

function isTokenId(value: unknown): value is string {
	return typeof value === "string" && /^[0-9a-z]{16}$/.test(value);
}

function isArtifactToken(value: unknown): value is string {
	return (
		typeof value === "string" &&
		/^art_v(?:1_[0-9a-f]{40}|2_[xeuf]_[0-9a-f]{40})(?:\?expires=\d+)?$/.test(
			value
		)
	);
}

function validateHash(hash: unknown): asserts hash is string {
	if (!hash) {
		throw new ArtifactsError("INVALID_INPUT", "Invalid hash: hash required.");
	}
	if (typeof hash !== "string" || !/^[0-9a-f]{40}$/.test(hash)) {
		throw new ArtifactsError(
			"INVALID_INPUT",
			"Invalid hash: expected a 40-character SHA-1 hex hash."
		);
	}
}

function normalizePath(path: string): string | null {
	const segments = path
		.split("/")
		.filter((segment) => segment !== "" && segment !== ".");
	if (segments.includes("..") || segments.length === 0) {
		return null;
	}
	return segments.join("/");
}

function contentType(path: string, bytes: Uint8Array): string {
	const extension = path.toLowerCase().match(/\.[^./]+$/)?.[0];
	const known: Record<string, string> = {
		".png": "image/png",
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".gif": "image/gif",
		".webp": "image/webp",
		".ico": "image/x-icon",
		".pdf": "application/pdf",
	};
	if (extension && known[extension]) {
		return known[extension];
	}
	return bytes.subarray(0, 8192).includes(0)
		? "application/octet-stream"
		: "text/plain;charset=utf-8";
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
	return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function encodeCursor(offset: number): string {
	return btoa(JSON.stringify({ offset }));
}

function decodeCursor(cursor: string | undefined): number {
	if (cursor === undefined) {
		return 0;
	}
	try {
		const value = JSON.parse(atob(cursor)) as { offset?: unknown };
		return typeof value.offset === "number" &&
			Number.isInteger(value.offset) &&
			value.offset >= 0
			? value.offset
			: 0;
	} catch {
		return 0;
	}
}

async function publicCall<T>(action: () => Promise<T>): Promise<T> {
	try {
		return await action();
	} catch (error) {
		if (isArtifactsError(error)) {
			throw error;
		}
		throw new ArtifactsError("INTERNAL_ERROR", "An internal error occurred.");
	}
}

function isArtifactsError(error: unknown): error is ArtifactsError {
	return (
		error instanceof Error &&
		error.name === "ArtifactsError" &&
		"code" in error &&
		typeof error.code === "string" &&
		"numericCode" in error &&
		typeof error.numericCode === "number"
	);
}

function classifyImportError(message: string): ArtifactsError {
	const normalized = message.toLowerCase();
	if (
		normalized.includes("authentication failed") ||
		normalized.includes("could not read username") ||
		normalized.includes("http 401")
	) {
		return new ArtifactsError(
			"REMOTE_AUTH_REQUIRED",
			"Authentication is required to access the remote repository."
		);
	}
	if (
		normalized.includes("remote branch") &&
		normalized.includes("not found")
	) {
		return new ArtifactsError("NOT_FOUND", "Remote branch not found.");
	}
	if (
		normalized.includes("not found") ||
		normalized.includes("repository not found")
	) {
		return new ArtifactsError("NOT_FOUND", "Remote repository not found.");
	}
	if (normalized.includes("does not appear to be a git repository")) {
		return new ArtifactsError(
			"INVALID_URL",
			"The URL does not point to a git repository."
		);
	}
	return new ArtifactsError(
		"UPSTREAM_UNAVAILABLE",
		"The upstream service is unavailable. Please retry."
	);
}
