import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { devNull, tmpdir } from "node:os";
import path from "node:path";

const decoder = new TextDecoder();
type GitOptions = { allowFailure?: boolean; timeout?: number };
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

/** Verify host Git at startup and report how to install it if unavailable. */
export async function assertGitAvailable(): Promise<void> {
	try {
		await runGit(["--version"], { timeout: 30_000 });
	} catch (error) {
		throw new Error(
			"Local Artifacts requires Git installed on the host and available on PATH. Install Git, verify that `git --version` works, then restart your dev server or test runner.",
			{ cause: error }
		);
	}
}

export async function runGit(
	args: string[],
	options: GitOptions = {}
): Promise<GitResult> {
	return new Promise((resolve, reject) => {
		const child = spawn("git", args, {
			env: gitEnvironment(),
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

export interface CommitMetadata {
	hash: string;
	treeHash: string;
	message: string;
	author: { name: string; email: string };
	committer: { name: string; email: string };
	parents: string[];
	authoredAt: number;
	committedAt: number;
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
		// An import may carry credentials. Never let Git redirect them to a
		// different destination (or silently expand the requested network access).
		const args = ["-c", "http.followRedirects=false", "clone", "--bare"];
		if (branch) {
			args.push("--branch", branch, "--single-branch");
		}
		if (depth) {
			args.push("--depth", String(depth));
		}
		args.push(url, this.repository);
		await runGit(args);
		// A bare clone records remote.origin.url in its local Git config. It may
		// include Basic credentials or query tokens used only for the import.
		// Local repositories do not fetch from the upstream after creation.
		await this.git(["remote", "remove", "origin"]);
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

	async readTree(hash: string): Promise<Array<{
		name: string;
		mode: string;
		hash: string;
		type: string;
	}> | null> {
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
		const commit = await this.resolveCommit(ref ?? "HEAD", ref === undefined);
		if (!commit) {
			return [];
		}
		const effectiveLimit = Math.min(limit, 1000);
		const revs = await this.git(
			[
				"rev-list",
				"--first-parent",
				`--max-count=${effectiveLimit}`,
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
		return Promise.all(
			hashes.map(async (hash) => {
				const commitMetadata = await this.readCommit(hash);
				if (!commitMetadata) {
					throw new Error(`Commit disappeared: ${hash}`);
				}
				return commitMetadata;
			})
		);
	}

	private async objectType(hash: string): Promise<string | null> {
		const result = await this.git(["cat-file", "-t", hash], {
			allowFailure: true,
		});
		return result.status === 0 ? decoder.decode(result.stdout).trim() : null;
	}

	private async resolveCommit(
		ref: string,
		allowHead = false
	): Promise<string | null> {
		const candidates = allowHead
			? ["HEAD"]
			: /^[0-9a-f]{40}$/.test(ref)
				? [ref]
				: [`refs/heads/${ref}`, `refs/tags/${ref}`];
		for (const candidate of candidates) {
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

function commitHeader(headers: string[], name: string): string | undefined {
	return headers
		.find((line) => line.startsWith(`${name} `))
		?.slice(name.length + 1);
}

function parseCommitIdentity(
	headers: string[],
	name: string
): {
	person: { name: string; email: string };
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

function treeEntryType(mode: string): string {
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
