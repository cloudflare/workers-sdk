import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { join } from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import { removeDir } from "@cloudflare/workers-utils/fs-helpers";
import { GitClient, gitEnvironment, runGit } from "./git-client";
import type { RepositoryState } from "./git-client";

const adminPath = "/__local_artifacts__";
const componentPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const repositoryLocks = new Map<string, Promise<void>>();
const decoder = new TextDecoder();

if (parentPort) {
	const port = parentPort;
	void startGitSidecar(workerData.root).then((sidecar) => {
		port.postMessage({ address: sidecar.address, secret: sidecar.secret });
		port.once("message", async () => {
			await sidecar.close();
			port.close();
		});
	});
}

export interface GitSidecar {
	address: string;
	secret: string;
	close(): Promise<void>;
}

interface AdminRequest {
	action:
		| "create"
		| "delete"
		| "fork"
		| "import"
		| "refs"
		| "readBlob"
		| "readTree"
		| "readCommit"
		| "file"
		| "log";
	namespace: string;
	name: string;
	defaultBranch?: string;
	defaultBranchOnly?: boolean;
	sourceName?: string;
	sourceBranch?: string;
	sourceUrl?: string;
	branch?: string;
	depth?: number;
	hash?: string;
	ref?: string;
	path?: string;
	limit?: number;
	offset?: number;
	generation?: string;
}

function createGitSecret(): string {
	return randomBytes(32).toString("hex");
}

export async function startGitSidecar(root: string): Promise<GitSidecar> {
	await mkdir(root, { recursive: true });
	await runGit(["--version"]);
	const secret = createGitSecret();
	const server = createServer((request, response) => {
		if (request.headers["x-local-artifacts-backend"] !== secret) {
			response.writeHead(403).end("Forbidden");
			return;
		}
		void handleRequest(root, request, response).catch((error: unknown) => {
			if (response.headersSent) {
				response.destroy(error instanceof Error ? error : undefined);
			} else {
				response.writeHead(500, { "Content-Type": "text/plain" });
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
	request: IncomingMessage,
	response: ServerResponse
): Promise<void> {
	const url = new URL(request.url ?? "/", "http://local-artifacts.invalid");
	if (url.pathname === adminPath) {
		await handleAdmin(root, request, response);
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
	await withRepositoryLocks([path], async () => {
		const generation = request.headers["x-local-artifacts-generation"];
		const configured = await new GitClient(path).generation();
		if (typeof generation !== "string" || generation !== configured) {
			response.writeHead(409).end("Repository generation changed");
			return;
		}
		await runGitHttpBackend(
			root,
			request,
			response,
			`/${storageComponent(namespace)}/${storageComponent(repository)}.git${suffix}`,
			url.search.slice(1)
		);
	});
}

async function handleAdmin(
	root: string,
	request: IncomingMessage,
	response: ServerResponse
): Promise<void> {
	if (request.method !== "POST") {
		response.writeHead(405).end("Method not allowed");
		return;
	}
	const body = JSON.parse(
		decoder.decode(await readRequest(request))
	) as AdminRequest;
	validateComponent(body.namespace, "namespace");
	validateComponent(body.name, "repository");
	const repository = repositoryPath(root, body.namespace, body.name);
	const lockPaths = [repository];
	if (body.action === "fork" && body.sourceName) {
		validateComponent(body.sourceName, "repository");
		lockPaths.push(repositoryPath(root, body.namespace, body.sourceName));
	}
	await withRepositoryLocks(lockPaths, async () => {
		const result = await handleAction(root, body, new GitClient(repository));
		response.writeHead(200, { "Content-Type": "application/json" });
		response.end(JSON.stringify(result));
	});
}

async function handleAction(
	root: string,
	body: AdminRequest,
	git: GitClient
): Promise<unknown> {
	switch (body.action) {
		case "create":
			return handleCreate(root, body, git);
		case "delete":
			await removeDir(git.repository);
			return true;
		case "fork":
			return handleFork(root, body, git);
		case "import":
			return handleImport(root, body, git);
		case "refs":
			return git.state();
		case "readBlob":
			return git.readBlob(required(body.hash, "hash"));
		case "readTree":
			return git.readTree(required(body.hash, "hash"));
		case "readCommit":
			return git.readCommit(required(body.hash, "hash"));
		case "file":
			return git.readFile(
				required(body.ref, "ref"),
				required(body.path, "path")
			);
		case "log":
			return git.log(body.ref, body.limit, body.offset);
	}
}

function handleCreate(
	root: string,
	body: AdminRequest,
	git: GitClient
): Promise<RepositoryState> {
	return withNewRepository(root, body, git, () =>
		git.init(body.defaultBranch ?? "main")
	);
}

function handleFork(
	root: string,
	body: AdminRequest,
	git: GitClient
): Promise<RepositoryState> {
	const { sourceName, sourceBranch } = body;
	if (!sourceName) {
		throw new Error("Fork source is required");
	}
	if (!sourceBranch) {
		throw new Error("Fork source branch is required");
	}
	const source = new GitClient(
		repositoryPath(root, body.namespace, sourceName)
	);
	return withNewRepository(root, body, git, () =>
		git.forkFrom(source, sourceBranch, body.defaultBranchOnly ?? true)
	);
}

function handleImport(
	root: string,
	body: AdminRequest,
	git: GitClient
): Promise<RepositoryState> {
	const { sourceUrl } = body;
	if (!sourceUrl) {
		throw new Error("Import source is required");
	}
	return withNewRepository(root, body, git, () =>
		git.importFrom(sourceUrl, body.branch, body.depth)
	);
}

async function withNewRepository(
	root: string,
	body: AdminRequest,
	git: GitClient,
	initialize: () => Promise<void>
): Promise<RepositoryState> {
	await mkdir(repositoryNamespacePath(root, body.namespace), {
		recursive: true,
	});
	if (await exists(git.repository)) {
		throw new Error(`Repository "${body.name}" already exists on disk`);
	}
	try {
		await initialize();
		await git.configure(required(body.generation, "generation"));
		return await git.state();
	} catch (error) {
		await removeDir(git.repository);
		throw error;
	}
}

function required(value: string | undefined, name: string): string {
	if (!value) {
		throw new Error(`${name} is required`);
	}
	return value;
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
	query: string
): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn("git", ["http-backend"], {
			env: {
				...gitEnvironment(),
				GIT_PROJECT_ROOT: root,
				GIT_HTTP_EXPORT_ALL: "1",
				PATH_INFO: pathInfo,
				QUERY_STRING: query,
				REQUEST_METHOD: request.method ?? "GET",
				CONTENT_TYPE: request.headers["content-type"] ?? "",
				CONTENT_LENGTH: request.headers["content-length"] ?? "",
				HTTP_GIT_PROTOCOL: String(request.headers["git-protocol"] ?? ""),
				REMOTE_USER: "local-artifacts",
				REMOTE_ADDR: request.socket.remoteAddress ?? "127.0.0.1",
			},
			stdio: ["pipe", "pipe", "pipe"],
		});
		let header = Buffer.alloc(0);
		let headersSent = false;
		let settled = false;
		let timedOut = false;
		const timeout = setTimeout(() => {
			timedOut = true;
			child.kill();
		}, 300_000);
		timeout.unref();
		const stderr: Buffer[] = [];
		const finish = (error?: Error) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeout);
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
				child.kill();
			}
		};
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
					child.kill();
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
		request.pipe(child.stdin);
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

function repositoryPath(root: string, namespace: string, name: string): string {
	return join(
		repositoryNamespacePath(root, namespace),
		`${storageComponent(name)}.git`
	);
}

function repositoryNamespacePath(root: string, namespace: string): string {
	return join(root, storageComponent(namespace));
}

function storageComponent(value: string): string {
	return createHash("sha256").update(value).digest("hex");
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
