import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readdir, rename, stat } from "node:fs/promises";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import path from "node:path";
import { Transform } from "node:stream";
import { parentPort, workerData } from "node:worker_threads";
import { removeDir } from "@cloudflare/workers-utils/fs-helpers";
import { z } from "zod";
import {
	assertGitAvailable,
	GitClient,
	gitArgumentsWithoutHooks,
	gitEnvironment,
	LocalRepositoryStorageError,
	stopGitProcess,
	withRepositoryCreationLock,
} from "./git-client";
import {
	assertSupportedGitLayout,
	repositoryDirectory,
	repositoryPath,
} from "./storage";
import type { RepositoryState } from "./git-client";

const adminPath = "/__local_artifacts__";
const componentPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
type RepositoryLocks = Map<string, Promise<void>>;
type InFlightGitRequest = {
	path: string;
	generation: string;
	abort: () => void;
};
const decoder = new TextDecoder();

if (parentPort) {
	const port = parentPort;
	void startGitSidecar(workerData.root).then(
		(sidecar) => {
			port.postMessage({ address: sidecar.address, secret: sidecar.secret });
			port.once("message", () => {
				void sidecar.close().then(
					() => port.close(),
					() => port.close()
				);
			});
		},
		(error: unknown) => {
			port.postMessage({
				error:
					error instanceof Error
						? error.message
						: "Unable to start local Artifacts Git backend",
			});
			port.close();
		}
	);
}

export interface GitSidecar {
	address: string;
	secret: string;
	close(): Promise<void>;
}

const adminBase = z.object({
	namespace: z.string().regex(componentPattern),
	name: z.string().regex(componentPattern),
});
const generatedRepo = adminBase.extend({ generation: z.string().min(1) });
const AdminRequestSchema = z.discriminatedUnion("action", [
	generatedRepo.extend({
		action: z.literal("create"),
		defaultBranch: z.string().optional(),
	}),
	generatedRepo.extend({ action: z.literal("delete") }),
	generatedRepo.extend({
		action: z.literal("fork"),
		sourceName: z.string().regex(componentPattern),
		sourceBranch: z.string().min(1),
		defaultBranchOnly: z.boolean().optional(),
	}),
	generatedRepo.extend({
		action: z.literal("import"),
		sourceUrl: z.string().min(1),
		branch: z.string().optional(),
		depth: z.number().optional(),
	}),
	generatedRepo.extend({ action: z.literal("refs") }),
	generatedRepo.extend({
		action: z.literal("readBlob"),
		hash: z.string().min(1),
	}),
	generatedRepo.extend({
		action: z.literal("readTree"),
		hash: z.string().min(1),
	}),
	generatedRepo.extend({
		action: z.literal("readCommit"),
		hash: z.string().min(1),
	}),
	generatedRepo.extend({
		action: z.literal("file"),
		ref: z.string().min(1),
		path: z.string().min(1),
	}),
	generatedRepo.extend({
		action: z.literal("log"),
		ref: z.string().optional(),
		limit: z.number().optional(),
		offset: z.number().optional(),
	}),
	generatedRepo.extend({
		action: z.literal("abortPush"),
		requestId: z.uuid(),
	}),
]);

type AdminRequest = z.infer<typeof AdminRequestSchema>;
type GitAction = Exclude<AdminRequest, { action: "abortPush" }>;
type CreateRequest = Extract<AdminRequest, { action: "create" }>;
type ForkRequest = Extract<AdminRequest, { action: "fork" }>;
type ImportRequest = Extract<AdminRequest, { action: "import" }>;
type NewRepositoryRequest = CreateRequest | ForkRequest | ImportRequest;

function createGitSecret(): string {
	return randomBytes(32).toString("hex");
}

export async function startGitSidecar(root: string): Promise<GitSidecar> {
	await mkdir(root, { recursive: true });
	await assertSupportedGitLayout(root);
	await assertGitAvailable();
	await cleanupInterruptedRepositories(root);
	const secret = createGitSecret();
	const shutdown = new AbortController();
	const repositoryLocks: RepositoryLocks = new Map();
	const inFlight = new Map<string, InFlightGitRequest>();
	const server = createServer((request, response) => {
		if (request.headers["x-local-artifacts-backend"] !== secret) {
			response.writeHead(403).end("Forbidden");
			return;
		}
		void handleRequest(
			root,
			repositoryLocks,
			inFlight,
			request,
			response,
			shutdown.signal
		).catch((error: unknown) => {
			if (response.headersSent) {
				response.destroy(error instanceof Error ? error : undefined);
			} else {
				const storageError = error instanceof LocalRepositoryStorageError;
				response.writeHead(storageError ? 409 : 500, {
					"Content-Type": "text/plain",
					...(storageError
						? { "X-Local-Artifacts-Storage-Error": error.kind }
						: {}),
				});
				response.end(
					error instanceof Error ? error.message : "Native Git backend failed"
				);
			}
		});
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", reject);
			resolve();
		});
	});
	// The listener outlives this function; ArtifactsController closes it on disposal.
	// `using` here would close it before workerd could make any requests.
	server.unref();
	const addressInfo = server.address();
	if (!addressInfo || typeof addressInfo === "string") {
		throw new Error("Unable to start native Git backend");
	}
	const address = `127.0.0.1:${addressInfo.port}`;
	return {
		address,
		secret,
		close() {
			shutdown.abort();
			server.closeAllConnections();
			return new Promise<void>((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()));
			});
		},
	};
}

function parseGitPath(pathname: string): {
	namespace: string;
	repository: string;
	suffix: string;
} | null {
	const match = pathname.match(/^\/git\/([^/]+)\/([^/]+\.git)(\/.*)?$/);
	if (!match?.[1] || !match[2]) {
		return null;
	}
	const namespace = decodeURIComponent(match[1]);
	const repository = decodeURIComponent(match[2].slice(0, -4));
	validateComponent(namespace, "namespace");
	validateComponent(repository, "repository");
	return { namespace, repository, suffix: match[3] ?? "" };
}

// Native Git's CGI backend needs streaming Node requests and responses; keep
// packfiles on node:http rather than buffering them through a Worker router.
async function handleRequest(
	root: string,
	locks: RepositoryLocks,
	inFlight: Map<string, InFlightGitRequest>,
	request: IncomingMessage,
	response: ServerResponse,
	signal: AbortSignal
): Promise<void> {
	const url = new URL(request.url ?? "/", "http://local-artifacts.invalid");
	if (url.pathname === adminPath) {
		await handleAdmin(root, locks, inFlight, request, response, signal);
		return;
	}
	const gitPath = parseGitPath(url.pathname);
	if (!gitPath) {
		response.writeHead(404).end("Not found");
		return;
	}
	const { namespace, repository, suffix } = gitPath;
	const contentLength = Number(request.headers["content-length"] ?? 0);
	if (!Number.isFinite(contentLength) || contentLength > 256 * 1024 * 1024) {
		response.writeHead(413).end("Request body too large");
		return;
	}
	const path = repositoryPath(root, namespace, repository);
	await withRepositoryLocks(locks, [path], async () => {
		const generation = request.headers["x-local-artifacts-generation"];
		const configured = await new GitClient(path, signal).generation();
		if (typeof generation !== "string" || generation !== configured) {
			response.writeHead(409).end("Repository generation changed");
			return;
		}
		const requestId = request.headers["x-local-artifacts-request-id"];
		const trackPush =
			request.method === "POST" &&
			suffix === "/git-receive-pack" &&
			typeof requestId === "string" &&
			/^[0-9a-f-]{36}$/.test(requestId);
		try {
			await runGitHttpBackend(
				root,
				request,
				response,
				`/${repositoryDirectory(namespace, repository)}${suffix}`,
				url.search.slice(1),
				trackPush
					? (abort) =>
							inFlight.set(requestId, {
								path,
								generation,
								abort,
							})
					: undefined,
				signal
			);
		} finally {
			if (trackPush) {
				inFlight.delete(requestId);
			}
		}
	});
}

async function handleAdmin(
	root: string,
	locks: RepositoryLocks,
	inFlight: Map<string, InFlightGitRequest>,
	request: IncomingMessage,
	response: ServerResponse,
	signal: AbortSignal
): Promise<void> {
	if (request.method !== "POST") {
		response.writeHead(405).end("Method not allowed");
		return;
	}
	const body = AdminRequestSchema.parse(
		JSON.parse(decoder.decode(await readRequest(request)))
	);
	const repository = repositoryPath(root, body.namespace, body.name);
	if (body.action === "abortPush") {
		const active = inFlight.get(body.requestId);
		if (active?.path === repository && active.generation === body.generation) {
			active.abort();
		}
		response.writeHead(200, { "Content-Type": "application/json" });
		response.end("true");
		return;
	}
	const lockPaths = [repository];
	if (body.action === "fork") {
		lockPaths.push(repositoryPath(root, body.namespace, body.sourceName));
	}
	await withRepositoryLocks(locks, lockPaths, async () => {
		const result = await handleAction(
			root,
			body,
			new GitClient(repository, signal)
		);
		response.writeHead(200, { "Content-Type": "application/json" });
		response.end(JSON.stringify(result));
	});
}

async function handleAction(
	root: string,
	body: GitAction,
	git: GitClient
): Promise<unknown> {
	// This check runs under the repository lock: a delayed read must not see
	// a different generation after the Worker checked its handle ID.
	if (
		body.action !== "create" &&
		body.action !== "delete" &&
		body.action !== "fork" &&
		body.action !== "import" &&
		(await git.generation()) !== body.generation
	) {
		throw new Error("Repository generation changed");
	}
	switch (body.action) {
		case "create":
			return handleCreate(root, body, git);
		case "delete":
			if (!(await exists(git.repository))) {
				return true;
			}
			// A retried tombstone must never delete a replacement repository.
			// An unreadable ownership marker must not clear the tombstone either.
			const generation = await git.generation();
			if (generation === null) {
				throw new Error("Unable to verify Git repository ownership");
			}
			if (generation === body.generation) {
				await retireRepository(git.repository);
			}
			return true;
		case "fork":
			return handleFork(root, body, git);
		case "import":
			return handleImport(root, body, git);
		case "refs":
			return git.state();
		case "readBlob":
			return git.readBlob(body.hash);
		case "readTree":
			return git.readTree(body.hash);
		case "readCommit":
			return git.readCommit(body.hash);
		case "file":
			return git.readFile(body.ref, body.path);
		case "log":
			return git.log(body.ref, body.limit, body.offset);
	}
}

function handleCreate(
	root: string,
	body: CreateRequest,
	git: GitClient
): Promise<RepositoryState> {
	return withNewRepository(root, body, git, (staged) =>
		staged.init(body.defaultBranch ?? "main")
	);
}

function handleFork(
	root: string,
	body: ForkRequest,
	git: GitClient
): Promise<RepositoryState> {
	const { sourceName, sourceBranch } = body;
	const source = git.withRepository(
		repositoryPath(root, body.namespace, sourceName)
	);
	return withNewRepository(root, body, git, (staged) =>
		staged.forkFrom(source, sourceBranch, body.defaultBranchOnly ?? true)
	);
}

function handleImport(
	root: string,
	body: ImportRequest,
	git: GitClient
): Promise<RepositoryState> {
	const { sourceUrl } = body;
	return withNewRepository(root, body, git, (staged) =>
		staged.importFrom(sourceUrl, body.branch, body.depth)
	);
}

async function withNewRepository(
	root: string,
	body: NewRepositoryRequest,
	git: GitClient,
	initialize: (staged: GitClient) => Promise<void>
): Promise<RepositoryState> {
	await mkdir(root, { recursive: true });
	return withRepositoryCreationLock(git.repository, async () => {
		if (await exists(git.repository)) {
			// The namespace has no record for this name. A prior deletion may have
			// committed metadata before the process stopped removing Git data.
			// Never remove a directory that was not created by this simulator.
			if ((await git.generation()) === null) {
				throw new LocalRepositoryStorageError(
					"on-disk-conflict",
					`Repository "${body.name}" already exists on disk`
				);
			}
			await retireRepository(git.repository);
		}
		// All initialization and cleanup happens under an owned staging directory.
		// A failed clone or fork must not remove a repository created concurrently
		// at the final path by another host process.
		const stagingDirectory = await mkdtemp(
			path.join(root, ".artifacts-stage-")
		);
		const staged = git.withRepository(path.join(stagingDirectory, "repo.git"));
		try {
			await initialize(staged);
			await staged.configure(body.generation);
			const state = await staged.state();
			if (await exists(git.repository)) {
				throw new LocalRepositoryStorageError(
					"on-disk-conflict",
					`Repository "${body.name}" already exists on disk`
				);
			}
			await rename(staged.repository, git.repository);
			return state;
		} finally {
			await removeDir(stagingDirectory);
		}
	});
}

// Moving the directory out of its active path is atomic on the same volume.
// A crash while removing its contents leaves only an inaccessible trash path;
// the next sidecar startup retries cleanup without blocking name reuse.
async function retireRepository(repository: string): Promise<void> {
	const retired = `${repository}.deleting-${randomBytes(16).toString("hex")}`;
	try {
		await rename(repository, retired);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return;
		}
		throw error;
	}
	await removeDir(retired);
}

async function cleanupInterruptedRepositories(root: string): Promise<void> {
	const retired = /^[0-9a-f]{32}\.git\.deleting-[0-9a-f]{32}$/;
	const partialImport = /^\.artifacts-import-[a-zA-Z0-9]{6}$/;
	const partialCreation = /^\.artifacts-stage-[a-zA-Z0-9]{6}$/;
	// Only staging and retired directories are safe to remove. A creation
	// lock may still be held by another process, so never clear it here.
	for (const entry of await readdir(root, { withFileTypes: true })) {
		if (
			entry.isDirectory() &&
			(retired.test(entry.name) ||
				partialImport.test(entry.name) ||
				partialCreation.test(entry.name))
		) {
			await removeDir(path.join(root, entry.name));
		}
	}
}

function parseGitBackendHeaders(headerBytes: Buffer): {
	status: number;
	headers: Record<string, string>;
} {
	const lines = decoder.decode(headerBytes).split(/\r?\n/);
	let status = 200;
	const headers: Record<string, string> = {};
	for (const line of lines) {
		const separator = line.indexOf(":");
		if (separator < 0) {
			continue;
		}
		const name = line.slice(0, separator);
		const value = line.slice(separator + 1).trim();
		if (name.toLowerCase() === "status") {
			status = Number(value.slice(0, 3));
		} else {
			headers[name] = value;
		}
	}
	return { status, headers };
}

async function runGitHttpBackend(
	root: string,
	request: IncomingMessage,
	response: ServerResponse,
	pathInfo: string,
	query: string,
	registerAbort?: (abort: () => void) => void,
	signal?: AbortSignal
): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn("git", gitArgumentsWithoutHooks(["http-backend"]), {
			env: {
				...gitEnvironment(),
				GIT_PROJECT_ROOT: root,
				GIT_HTTP_EXPORT_ALL: "1",
				PATH_INFO: pathInfo,
				QUERY_STRING: query,
				REQUEST_METHOD: request.method ?? "GET",
				CONTENT_TYPE: request.headers["content-type"] ?? "",
				CONTENT_LENGTH: request.headers["content-length"] ?? "",
				HTTP_CONTENT_ENCODING: String(
					request.headers["content-encoding"] ?? ""
				),
				HTTP_GIT_PROTOCOL: String(request.headers["git-protocol"] ?? ""),
				REMOTE_USER: "local-artifacts",
				REMOTE_ADDR: request.socket.remoteAddress ?? "127.0.0.1",
			},
			stdio: ["pipe", "pipe", "pipe"],
			detached: process.platform !== "win32",
			signal,
		});
		const stop = () => stopGitProcess(child);
		if (signal?.aborted) {
			stop();
		} else {
			signal?.addEventListener("abort", stop, { once: true });
		}
		let header = Buffer.alloc(0);
		let headersSent = false;
		let settled = false;
		let timedOut = false;
		let uploadTooLarge = false;
		const timeout = setTimeout(() => {
			timedOut = true;
			stop();
		}, 300_000);
		timeout.unref();
		const stderr: Buffer[] = [];
		const finish = (error?: Error) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeout);
			signal?.removeEventListener("abort", stop);
			request.off("aborted", abort);
			response.off("close", abort);
			if (error) {
				reject(error);
			} else {
				resolve();
			}
		};
		const abort = () => {
			if (!response.writableEnded) {
				stop();
			}
		};
		registerAbort?.(() => {
			stop();
			response.destroy();
		});
		const write = (chunk: Buffer) => {
			if (!response.write(chunk)) {
				child.stdout.pause();
				response.once("drain", () => child.stdout.resume());
			}
		};
		request.once("aborted", abort);
		response.once("close", abort);
		child.stdin.on("error", (error) => {
			if (!request.destroyed) {
				finish(error);
			}
		});
		child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
		child.stdout.on("data", (chunk: Buffer) => {
			if (headersSent) {
				write(chunk);
				return;
			}
			header = Buffer.concat([header, chunk]);
			const crlf = header.indexOf("\r\n\r\n");
			const lf = header.indexOf("\n\n");
			const index = crlf >= 0 ? crlf : lf;
			if (index < 0) {
				if (header.length > 64 * 1024) {
					stop();
				}
				return;
			}
			const separatorLength = crlf >= 0 ? 4 : 2;
			const { status, headers } = parseGitBackendHeaders(
				header.subarray(0, index)
			);
			response.writeHead(status, headers);
			headersSent = true;
			const remaining = header.subarray(index + separatorLength);
			if (remaining.length) {
				write(remaining);
			}
			header = Buffer.alloc(0);
		});
		child.stdout.on("end", () => {
			if (headersSent) {
				response.end();
			}
		});
		child.once("error", finish);
		child.once("close", (status) => {
			if (uploadTooLarge) {
				finish();
				return;
			}
			if (timedOut) {
				finish(new Error("git http-backend timed out"));
				return;
			}
			if (!headersSent) {
				finish(
					new Error(
						decoder.decode(Buffer.concat(stderr)).trim() ||
							`git http-backend exited with status ${status}`
					)
				);
			} else {
				finish();
			}
		});
		const upload = limitGitUpload(256 * 1024 * 1024, () => {
			uploadTooLarge = true;
			if (!response.headersSent) {
				response.writeHead(413).end("Request body too large");
			}
			stop();
		});
		upload.on("error", () => {
			request.unpipe(upload);
			child.stdin.destroy();
		});
		request.pipe(upload).pipe(child.stdin);
	});
}

export function limitGitUpload(
	maxBytes: number,
	onLimit: () => void
): Transform {
	let received = 0;
	return new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			received += chunk.length;
			if (received > maxBytes) {
				onLimit();
				callback(new Error("Git upload exceeds the request size limit"));
			} else {
				callback(null, chunk);
			}
		},
	});
}

function readRequest(request: IncomingMessage): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		request.on("data", (chunk: Buffer) => chunks.push(chunk));
		request.once("end", () => resolve(Buffer.concat(chunks)));
		request.once("error", reject);
	});
}

function validateComponent(value: string, type: string): void {
	if (!componentPattern.test(value)) {
		throw new Error(`Invalid ${type}`);
	}
}

async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return false;
		}
		throw error;
	}
}

async function withRepositoryLocks<T>(
	repositoryLocks: RepositoryLocks,
	paths: string[],
	action: () => Promise<T>
): Promise<T> {
	const keys = [...new Set(paths)].sort();
	const previous = keys.map(
		(key) => repositoryLocks.get(key) ?? Promise.resolve()
	);
	let release!: () => void;
	const current = new Promise<void>((resolve) => {
		release = resolve;
	});
	for (const key of keys) {
		repositoryLocks.set(key, current);
	}
	await Promise.all(previous);
	try {
		return await action();
	} finally {
		release();
		for (const key of keys) {
			if (repositoryLocks.get(key) === current) {
				repositoryLocks.delete(key);
			}
		}
	}
}
