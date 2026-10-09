import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdtemp, open, rename, unlink } from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import path from "node:path";
import { removeDir } from "@cloudflare/workers-utils/fs-helpers";
import type { FileHandle } from "node:fs/promises";

const decoder = new TextDecoder();
type GitOptions = {
	allowFailure?: boolean;
	timeout?: number;
	httpAuthorization?: { origin: string; value: string };
};
type GitResult = { stdout: Buffer; stderr: Buffer; status: number };

// Git runs on the host, never in the user's Worker. Do not inherit Cloudflare
// tokens, Git config overrides, or credential helpers from the invoking shell.
export function gitEnvironment(
	source: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
	const keep = [
		"PATH",
		"SystemRoot",
		"WINDIR",
		"PATHEXT",
		"TMP",
		"TEMP",
		"TMPDIR",
		"LANG",
		// Explicit host CA bundles may be used to trust a private HTTPS Git origin.
		// Do not inherit other Git TLS overrides (especially GIT_SSL_NO_VERIFY),
		// credential helpers, or HTTP headers from the host environment.
		"GIT_SSL_CAINFO",
	];
	const env: NodeJS.ProcessEnv = {};
	for (const key of keep) {
		const value = source[key];
		if (value !== undefined) {
			env[key] = value;
		}
	}
	return {
		...env,
		GIT_CONFIG_NOSYSTEM: "1",
		// Git for Windows cannot read null-device paths. A unique, nonexistent
		// config path prevents it from falling back to the host's Git settings.
		GIT_CONFIG_GLOBAL:
			process.platform === "win32"
				? path.join(tmpdir(), `miniflare-artifacts-empty-${randomUUID()}`)
				: devNull,
		GIT_CONFIG_COUNT: "1",
		GIT_CONFIG_KEY_0: "credential.helper",
		GIT_CONFIG_VALUE_0: "",
		GIT_TERMINAL_PROMPT: "0",
	};
}

/** Require Git 2.32's GIT_CONFIG_GLOBAL to isolate native Git subprocesses. */
export function assertSupportedGitVersion(output: string): void {
	const match = /^git version (\d+)\.(\d+)(?:\.\d+)?(?:[.+ -][^\r\n]*)?$/.exec(
		output.trim()
	);
	const major = Number(match?.[1]);
	const minor = Number(match?.[2]);
	const supported =
		match !== null &&
		Number.isSafeInteger(major) &&
		Number.isSafeInteger(minor) &&
		(major > 2 || (major === 2 && minor >= 32));
	if (!supported) {
		const found =
			match && Number.isSafeInteger(major) && Number.isSafeInteger(minor)
				? ` Found ${match[0]}.`
				: " Could not determine Git version from `git --version`.";
		throw new Error(
			`Local Artifacts requires Git 2.32 or newer.${found} Upgrade Git, verify that \`git --version\` reports 2.32 or newer, then restart your dev server or test runner.`
		);
	}
}

/** Verify host Git at startup and report how to install or upgrade it. */
export async function assertGitAvailable(): Promise<void> {
	let version: string;
	try {
		const result = await runGit(["--version"], { timeout: 30_000 });
		version = decoder.decode(result.stdout);
	} catch (error) {
		throw new Error(
			"Local Artifacts requires Git installed on the host and available on PATH. Install Git 2.32 or newer, verify that `git --version` works, then restart your dev server or test runner.",
			{ cause: error }
		);
	}
	assertSupportedGitVersion(version);
}

/** Override repository-local hook configuration for any host Git command. */
export function gitArgumentsWithoutHooks(args: string[]): string[] {
	// Command-line config outranks repository-local config; environment config
	// does not. Use a nonexistent path that is unique for each invocation.
	const noHooks = path.join(
		tmpdir(),
		`miniflare-artifacts-no-hooks-${randomUUID()}`
	);
	return ["-c", `core.hooksPath=${noHooks}`, ...args];
}

export async function runGit(
	args: string[],
	options: GitOptions = {}
): Promise<GitResult> {
	return new Promise((resolve, reject) => {
		const env = gitEnvironment();
		if (options.httpAuthorization) {
			env.GIT_CONFIG_COUNT = "2";
			env.GIT_CONFIG_KEY_1 = `http.${options.httpAuthorization.origin}/.extraHeader`;
			env.GIT_CONFIG_VALUE_1 = options.httpAuthorization.value;
		}
		const child = spawn("git", gitArgumentsWithoutHooks(args), {
			env,
			stdio: ["pipe", "pipe", "pipe"],
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		const timeout = setTimeout(() => child.kill(), options.timeout ?? 300_000);
		timeout.unref();
		child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
		child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
		child.once("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});
		child.once("close", (status) => {
			clearTimeout(timeout);
			const result = {
				stdout: Buffer.concat(stdout),
				stderr: Buffer.concat(stderr),
				status: status ?? 1,
			};
			if (result.status === 0 || options.allowFailure) {
				resolve(result);
			} else {
				reject(
					new Error(
						decoder.decode(result.stderr).trim() ||
							`git ${args[0]} exited with status ${result.status}`
					)
				);
			}
		});
		child.stdin.end();
	});
}

export interface RepositoryState {
	defaultBranch: string;
	refs: Record<string, string>;
}

export interface GitPerson {
	name: string;
	email: string;
}

export interface CommitMetadata {
	hash: string;
	treeHash: string;
	message: string;
	author: GitPerson;
	committer: GitPerson;
	parents: string[];
	authoredAt: number;
	committedAt: number;
}

export type GitTreeEntryType = "tree" | "blob" | "symlink" | "gitlink" | "exec";

export interface GitTreeEntry {
	name: string;
	mode: string;
	hash: string;
	type: GitTreeEntryType;
}

type GitObjectType = "blob" | "tree" | "commit" | "tag";

/** Only one host process may publish a repository at this path at a time. */
export async function withRepositoryCreationLock<T>(
	repository: string,
	action: () => Promise<T>
): Promise<T> {
	const name = createHash("sha256")
		.update(path.basename(repository))
		.digest("hex")
		.slice(0, 32);
	const lockPath = path.join(
		path.dirname(repository),
		`.artifacts-create-${name}.lock`
	);
	let lock: FileHandle;
	try {
		lock = await open(lockPath, "wx", 0o600);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			throw new Error(
				`Another local process is creating this Git repository. Stop it and retry; if it crashed, remove "${lockPath}" only after confirming no process uses this storage path.`
			);
		}
		throw error;
	}
	try {
		return await action();
	} finally {
		await lock.close();
		await unlink(lockPath);
	}
}

/** Repository-scoped Git operations; clone/init are supported before it exists. */
export class GitClient {
	constructor(readonly repository: string) {}

	private git(args: string[], options?: GitOptions): Promise<GitResult> {
		return runGit(["-C", this.repository, ...args], options);
	}

	async init(defaultBranch: string): Promise<void> {
		await runGit([
			"init",
			"--bare",
			`--initial-branch=${defaultBranch}`,
			this.repository,
		]);
	}

	async forkFrom(
		source: GitClient,
		branch: string,
		defaultBranchOnly: boolean
	): Promise<void> {
		const sourceBranch = `refs/heads/${branch}`;
		const sourceHasBranch = await source.git(
			["rev-parse", "--verify", "--quiet", sourceBranch],
			{ allowFailure: true }
		);
		if (defaultBranchOnly && sourceHasBranch.status === 0) {
			await runGit([
				"clone",
				"--bare",
				"--local",
				"--single-branch",
				"--branch",
				branch,
				source.repository,
				this.repository,
			]);
		} else if (defaultBranchOnly) {
			// Git cannot clone a named branch that has no commits yet.
			await this.init(branch);
		} else {
			await runGit([
				"clone",
				"--bare",
				"--local",
				source.repository,
				this.repository,
			]);
		}
	}

	async importFrom(
		url: string,
		branch?: string,
		depth?: number
	): Promise<void> {
		return withRepositoryCreationLock(this.repository, async () => {
			await assertImportTargetAvailable(this.repository);
			const source = importSource(url);
			// Clone into a private, atomically reserved sibling. Even if another
			// process creates the final path during the clone, cleanup only touches
			// the directory we own, never that other process's repository.
			const staged = await mkdtemp(
				path.join(path.dirname(this.repository), ".artifacts-import-")
			);
			// An import may carry credentials. Never let Git redirect them to a
			// different destination (or silently expand the requested network access).
			const args = ["-c", "http.followRedirects=false", "clone", "--bare"];
			if (branch) {
				args.push("--branch", branch, "--single-branch");
			}
			if (depth) {
				args.push("--depth", String(depth));
			}
			args.push(source.url, staged);
			try {
				await runGit(args, { httpAuthorization: source.authorization });
				// A bare clone records remote.origin.url in its local Git config. It may
				// include credentials used only for the import. Never retain the remote.
				await new GitClient(staged).git(["remote", "remove", "origin"]);
				await assertImportTargetAvailable(this.repository);
				await rename(staged, this.repository);
			} catch (error) {
				// Git errors can echo URL credentials; do not propagate the raw error.
				// A failed clone can also leave a config containing the import URL.
				try {
					await removeDir(staged);
				} catch {
					throw new Error(
						`Git import failed and the partial repository at "${staged}" could not be removed. Delete it before retrying.`
					);
				}
				throw safeImportError(error);
			}
		});
	}

	async configure(generation: string): Promise<void> {
		await this.git(["config", "http.receivepack", "true"]);
		await this.git(["config", "local-artifacts.generation", generation]);
	}

	async generation(): Promise<string | null> {
		const result = await this.git(
			["config", "--get", "local-artifacts.generation"],
			{ allowFailure: true }
		);
		return result.status === 0 ? decoder.decode(result.stdout).trim() : null;
	}

	async state(): Promise<RepositoryState> {
		const refsOutput = await this.git([
			"for-each-ref",
			"--format=%(refname)%00%(objectname)",
		]);
		const refs: Record<string, string> = {};
		for (const line of decoder.decode(refsOutput.stdout).trim().split("\n")) {
			if (!line) {
				continue;
			}
			const [name, oid] = line.split("\0");
			if (name && oid) {
				refs[name] = oid;
			}
		}
		const head = await this.git(["symbolic-ref", "--short", "HEAD"], {
			allowFailure: true,
		});
		const defaultBranch =
			decoder
				.decode(head.stdout)
				.trim()
				.replace(/^refs\/heads\//, "") || "main";
		return { defaultBranch, refs };
	}

	async readBlob(hash: string): Promise<{ data: string } | null> {
		if ((await this.objectType(hash)) !== "blob") {
			return null;
		}
		const object = await this.git(["cat-file", "blob", hash]);
		return { data: Buffer.from(object.stdout).toString("base64") };
	}

	async readTree(hash: string): Promise<GitTreeEntry[] | null> {
		if ((await this.objectType(hash)) !== "tree") {
			return null;
		}
		const tree = await this.git(["ls-tree", "-z", hash]);
		return decoder
			.decode(tree.stdout)
			.split("\0")
			.filter(Boolean)
			.map((line) => {
				const match = /^(\d+) \w+ ([0-9a-f]{40})\t([\s\S]+)$/.exec(line);
				if (!match?.[1] || !match[2] || match[3] === undefined) {
					throw new Error("Invalid git tree output");
				}
				const mode = match[1] === "040000" ? "40000" : match[1];
				return {
					name: match[3],
					mode,
					hash: match[2],
					type: treeEntryType(mode),
				};
			});
	}

	async readCommit(hash: string): Promise<CommitMetadata | null> {
		if ((await this.objectType(hash)) !== "commit") {
			return null;
		}
		const object = await this.git(["cat-file", "commit", hash]);
		return parseCommit(hash, decoder.decode(object.stdout));
	}

	async readFile(ref: string, path: string): Promise<{ data: string } | null> {
		const commit = await this.resolveCommit(ref);
		if (!commit) {
			return null;
		}
		const entry = await this.git(["ls-tree", "-z", commit, "--", path], {
			allowFailure: true,
		});
		if (entry.status !== 0 || entry.stdout.length === 0) {
			return null;
		}
		const line = decoder.decode(entry.stdout).split("\0", 1)[0] ?? "";
		const match = /^(\d+) \w+ [0-9a-f]{40}\t([\s\S]+)$/.exec(line);
		if (!match?.[1] || match[2] !== path || match[1] === "040000") {
			return null;
		}
		const object = await this.git(["cat-file", "blob", `${commit}:${path}`], {
			allowFailure: true,
		});
		return object.status === 0
			? { data: Buffer.from(object.stdout).toString("base64") }
			: null;
	}

	async log(ref?: string, limit = 50, offset = 0): Promise<CommitMetadata[]> {
		if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
			throw new RangeError(
				"Git log limit must be an integer between 1 and 1000"
			);
		}
		if (!Number.isSafeInteger(offset) || offset < 0) {
			throw new RangeError("Git log offset must be a non-negative integer");
		}
		const commit = await this.resolveCommit(ref ?? "HEAD");
		if (!commit) {
			return [];
		}
		const revs = await this.git(
			[
				"rev-list",
				"--first-parent",
				`--max-count=${limit}`,
				`--skip=${offset}`,
				commit,
			],
			{ allowFailure: true }
		);
		if (revs.status !== 0) {
			return [];
		}
		const hashes = decoder
			.decode(revs.stdout)
			.trim()
			.split("\n")
			.filter(Boolean);
		const commits: CommitMetadata[] = [];
		// Each read starts a native process. Bound concurrent reads even for the
		// largest valid history page so one request cannot exhaust host resources.
		for (let start = 0; start < hashes.length; start += 8) {
			const batch = await Promise.all(
				hashes.slice(start, start + 8).map(async (hash) => {
					const commit = await this.readCommit(hash);
					if (!commit) {
						throw new Error(`Commit disappeared: ${hash}`);
					}
					return commit;
				})
			);
			commits.push(...batch);
		}
		return commits;
	}

	private async objectType(hash: string): Promise<GitObjectType | null> {
		const result = await this.git(["cat-file", "-t", hash], {
			allowFailure: true,
		});
		return result.status === 0
			? parseGitObjectType(decoder.decode(result.stdout).trim())
			: null;
	}

	private async resolveCommit(ref: string): Promise<string | null> {
		let candidates: string[];
		if (ref === "HEAD" || /^[0-9a-f]{40}$/.test(ref)) {
			candidates = [ref];
		} else if (ref.startsWith("refs/")) {
			if (!ref.startsWith("refs/heads/") && !ref.startsWith("refs/tags/")) {
				return null;
			}
			candidates = [ref];
		} else {
			candidates = [`refs/heads/${ref}`, `refs/tags/${ref}`];
		}
		for (const candidate of candidates) {
			if (candidate.startsWith("refs/")) {
				const valid = await this.git(["check-ref-format", candidate], {
					allowFailure: true,
				});
				if (valid.status !== 0) {
					continue;
				}
			}
			const result = await this.git(
				["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`],
				{ allowFailure: true }
			);
			if (result.status === 0) {
				return decoder.decode(result.stdout).trim();
			}
		}
		return null;
	}
}

function importSource(url: string): {
	url: string;
	authorization?: { origin: string; value: string };
} {
	// Native Git also accepts local paths and scp-style remotes. Only parse
	// HTTP(S) URLs, where userinfo can otherwise be written into Git config.
	if (!/^https?:\/\//i.test(url)) {
		return { url };
	}
	let source: URL;
	try {
		source = new URL(url);
	} catch {
		throw new Error("Git import source URL is invalid");
	}
	if (!source.username && !source.password) {
		return { url };
	}
	if (source.protocol !== "https:") {
		throw new Error("Git import credentials require HTTPS");
	}
	const value = `Authorization: Basic ${Buffer.from(
		`${decodeURIComponent(source.username)}:${decodeURIComponent(source.password)}`
	).toString("base64")}`;
	const origin = source.origin;
	source.username = "";
	source.password = "";
	// The sanitized URL is what Git records in config even if the host process
	// exits mid-clone. The one-time HTTP header is passed through process env.
	return { url: source.href, authorization: { origin, value } };
}

async function assertImportTargetAvailable(repository: string): Promise<void> {
	try {
		await lstat(repository);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return;
		}
		throw error;
	}
	throw new Error("Git import target already exists");
}

function safeImportError(error: unknown): Error {
	const detail = error instanceof Error ? error.message.toLowerCase() : "";
	if (detail === "git import target already exists") {
		return new Error("Git import target already exists");
	}
	if (
		detail.includes("authentication failed") ||
		detail.includes("could not read username") ||
		detail.includes("http 401") ||
		detail.includes("returned error: 401")
	) {
		return new Error("Git import authentication failed. Check credentials.");
	}
	if (detail.includes("remote branch") && detail.includes("not found")) {
		return new Error("Git import remote branch not found.");
	}
	if (detail.includes("does not appear to be a git repository")) {
		return new Error("Git import URL does not appear to be a git repository.");
	}
	if (detail.includes("not found")) {
		return new Error("Git import remote repository not found.");
	}
	return new Error(
		"Git import failed. Check the source URL, credentials, TLS certificate, and network access."
	);
}

function parseGitObjectType(value: string): GitObjectType {
	switch (value) {
		case "blob":
		case "tree":
		case "commit":
		case "tag":
			return value;
		default:
			throw new Error(`Unsupported Git object type: ${value}`);
	}
}

function commitHeader(headers: string[], name: string): string | undefined {
	return headers
		.find((line) => line.startsWith(`${name} `))
		?.slice(name.length + 1);
}

function parseCommitIdentity(
	headers: string[],
	name: string
): {
	person: GitPerson;
	time: number;
} {
	const match = /^(.*) <([^<>]*)> (-?\d+) [+-]\d{4}$/.exec(
		commitHeader(headers, name) ?? ""
	);
	if (!match?.[1] || match[2] === undefined || !match[3]) {
		throw new Error(`Invalid commit ${name}`);
	}
	return {
		person: { name: match[1], email: match[2] },
		time: Number(match[3]),
	};
}

function parseCommit(hash: string, value: string): CommitMetadata {
	const split = value.indexOf("\n\n");
	const headers = value.slice(0, split < 0 ? value.length : split).split("\n");
	const author = parseCommitIdentity(headers, "author");
	const committer = parseCommitIdentity(headers, "committer");
	const treeHash = commitHeader(headers, "tree");
	if (!treeHash) {
		throw new Error("Invalid commit tree");
	}
	return {
		hash,
		treeHash,
		message: (split < 0 ? "" : value.slice(split + 2)).replace(/\n$/, ""),
		author: author.person,
		committer: committer.person,
		parents: headers
			.filter((line) => line.startsWith("parent "))
			.map((line) => line.slice(7)),
		authoredAt: author.time,
		committedAt: committer.time,
	};
}

function treeEntryType(mode: string): GitTreeEntryType {
	if (mode === "40000") {
		return "tree";
	}
	if (mode === "120000") {
		return "symlink";
	}
	if (mode === "160000") {
		return "gitlink";
	}
	if (mode === "100755") {
		return "exec";
	}
	return "blob";
}
