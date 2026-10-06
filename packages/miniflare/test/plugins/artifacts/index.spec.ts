import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { devNull } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { removeDir } from "@cloudflare/workers-utils/fs-helpers";
import { Miniflare } from "miniflare";
import { test } from "vitest";
import {
	GitClient,
	gitEnvironment,
} from "../../../src/plugins/artifacts/git-client";
import { startGitSidecar } from "../../../src/plugins/artifacts/git-sidecar";
import { singleModuleManifest, useDispose, useTmp } from "../../test-shared";
import type { MiniflareOptions } from "miniflare";

const exec = promisify(execFile);
const SCRIPT = `
export default {
  async fetch(request, env) {
    const { method, name, args = [] } = await request.json();
    try {
      const target = name === undefined ? env.REPOS : await env.REPOS.get(name);
      if (method === "keys") return Response.json(Object.keys(target));
      const result = await target[method](...args);
      if (result instanceof Blob) {
        return Response.json({ bytes: [...new Uint8Array(await result.arrayBuffer())], type: result.type });
      }
      return Response.json(result);
    } catch (error) {
      return Response.json({ error: error.message, name: error.name, code: error.code, numericCode: error.numericCode }, { status: 400 });
    }
  }
};
`;

function options(
	namespace = "test",
	binding = "REPOS",
	remote: boolean | null = false
): MiniflareOptions {
	return {
		cf: false,
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2026-09-03",
					env: {
						[binding]: {
							type: "artifacts",
							namespace,
							...(remote === null ? {} : { dev: { remote } }),
						},
					},
					manifest: singleModuleManifest(SCRIPT),
				},
			},
		],
	};
}

function rpcRequest(
	mf: Miniflare,
	method: string,
	args: unknown[] = [],
	name?: string
): Promise<Response> {
	return mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({ method, args, name }),
	});
}

async function rpc(
	mf: Miniflare,
	method: string,
	args: unknown[] = [],
	name?: string
) {
	const response = await rpcRequest(mf, method, args, name);
	const result = (await response.json()) as any;
	if (!response.ok) {
		throw new Error(result.error);
	}
	return result;
}

async function rpcFailure(
	mf: Miniflare,
	method: string,
	args: unknown[] = [],
	name?: string
) {
	const response = await rpcRequest(mf, method, args, name);
	return {
		status: response.status,
		...((await response.json()) as {
			error: string;
			name: string;
			code: string;
			numericCode: number;
		}),
	};
}

function git(args: string[], cwd?: string) {
	return exec("git", args, {
		cwd,
		env: {
			...process.env,
			GIT_CONFIG_NOSYSTEM: "1",
			GIT_CONFIG_GLOBAL: devNull,
			GIT_TERMINAL_PROMPT: "0",
			GIT_AUTHOR_NAME: "Miniflare",
			GIT_AUTHOR_EMAIL: "miniflare@example.com",
			GIT_COMMITTER_NAME: "Miniflare",
			GIT_COMMITTER_EMAIL: "miniflare@example.com",
		},
	});
}

async function pushFixture(mf: Miniflare, directory: string) {
	const created = await rpc(mf, "create", ["Repo"]);
	await git(["init", "--initial-branch=main", directory]);
	await writeFile(path.join(directory, "hello.txt"), "hello artifacts\n");
	await writeFile(
		path.join(directory, "bytes.bin"),
		new Uint8Array([0, 255, 128, 1])
	);
	await git(["add", "."], directory);
	await git(["commit", "-m", "fixture"], directory);
	await git(
		[
			"-c",
			`http.extraHeader=Authorization: Bearer ${created.token}`,
			"push",
			created.remote,
			"main",
		],
		directory
	);
	return created;
}

test("artifacts: real RPC exposes current methods, not metadata or legacy methods", async ({
	expect,
}) => {
	const mf = new Miniflare(options());
	useDispose(mf);
	await rpc(mf, "create", ["Repo"]);
	const keys = await rpc(mf, "keys", [], "Repo");
	expect(keys).toContain("readFile");
	expect(keys).not.toContain("id");
	expect(keys).not.toContain("name");
	expect(keys).not.toContain("file");
	expect(keys).not.toContain("raw");
	expect(
		await rpc(mf, "readFile", [{ ref: "HEAD", path: "missing" }], "Repo")
	).toBeNull();
});

test("artifacts: native Git subprocesses do not inherit Cloudflare or host credentials", ({
	expect,
}) => {
	const env = gitEnvironment({
		PATH: "/usr/bin",
		CLOUDFLARE_API_TOKEN: "production-secret",
		GIT_CONFIG_GLOBAL: "/home/user/.gitconfig",
		GIT_CONFIG_PARAMETERS: "'credential.helper=unsafe'",
		GIT_ASKPASS: "/home/user/askpass",
		GITHUB_TOKEN: "github-secret",
	});
	expect(env.PATH).toBe("/usr/bin");
	expect(env.CLOUDFLARE_API_TOKEN).toBeUndefined();
	expect(env.GIT_CONFIG_PARAMETERS).toBeUndefined();
	expect(env.GIT_ASKPASS).toBeUndefined();
	expect(env.GITHUB_TOKEN).toBeUndefined();
	expect(env.GIT_CONFIG_VALUE_0).toBe("");
	expect(env.GIT_CONFIG_GLOBAL).toBe(devNull);
});

test("artifacts: Git client imports and reads a local fixture", async ({
	expect,
}) => {
	const directory = await useTmp();
	const source = path.join(directory, "source");
	await git(["init", "--initial-branch=main", source]);
	await writeFile(path.join(source, "hello.txt"), "hello artifacts\n");
	await git(["add", "."], source);
	await git(["commit", "-m", "fixture"], source);

	// The public binding requires HTTPS; file:// only exercises native Git here.
	const imported = new GitClient(path.join(directory, "imported.git"));
	await imported.importFrom(pathToFileURL(source).href, "main", 1);
	await imported.configure("local-generation");
	expect(await imported.generation()).toBe("local-generation");
	expect((await imported.state()).defaultBranch).toBe("main");
	expect((await imported.readFile("main", "hello.txt"))?.data).toBe(
		Buffer.from("hello artifacts\n").toString("base64")
	);
});

test("artifacts: omitted remote remains offline", async ({ expect }) => {
	const mf = new Miniflare(options("test", "REPOS", null));
	useDispose(mf);
	expect((await rpc(mf, "create", ["offline"])).name).toBe("offline");
});

test("artifacts: rejects invalid local namespace before starting services", async ({
	expect,
}) => {
	const mf = new Miniflare(options("../invalid"));
	await expect(mf.ready).rejects.toThrow(
		"Invalid local Artifacts namespace: ../invalid"
	);
	// dispose() preserves a startup failure after cleaning up the instance.
	await expect(mf.dispose()).rejects.toThrow(
		"Invalid local Artifacts namespace: ../invalid"
	);
});

test("artifacts: names are case-insensitive for create, get, fork and delete", async ({
	expect,
}) => {
	const mf = new Miniflare(options());
	useDispose(mf);
	const created = await rpc(mf, "create", ["Repo"]);
	expect((await rpc(mf, "info", [], "rEpO")).id).toBe(created.id);
	await expect(rpc(mf, "create", ["repo"])).rejects.toThrow(/already exists/i);
	await expect(rpc(mf, "fork", ["REPO"], "repo")).rejects.toThrow(
		/already exists/i
	);
	expect(await rpc(mf, "delete", ["REPO"])).toBe(true);
	expect(await rpc(mf, "delete", ["repo"])).toBe(false);
});

test("artifacts: supports Node binding proxies", async ({ expect }) => {
	const mf = new Miniflare(options());
	useDispose(mf);
	const { REPOS } = await mf.getBindings<{
		REPOS: {
			create(name: string): Promise<{ name: string }>;
			list(): Promise<{ total: number }>;
		};
	}>();
	expect(await REPOS.create("node-repo")).toMatchObject({ name: "node-repo" });
	expect(await REPOS.list()).toMatchObject({ total: 1 });
});

test("artifacts: aliases share a namespace while distinct namespaces are isolated", async ({
	expect,
}) => {
	const mf = new Miniflare({
		cf: false,
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2026-09-03",
					env: {
						REPOS: { type: "artifacts", namespace: "shared" },
						ALIAS: { type: "artifacts", namespace: "shared" },
						OTHER: { type: "artifacts", namespace: "other" },
					},
					manifest: singleModuleManifest(SCRIPT),
				},
			},
		],
	});
	useDispose(mf);
	const bindings = await mf.getBindings<{
		REPOS: { create(name: string): Promise<unknown> };
		ALIAS: { list(): Promise<{ total: number }> };
		OTHER: { list(): Promise<{ total: number }> };
	}>();
	await bindings.REPOS.create("shared-repo");
	expect((await bindings.ALIAS.list()).total).toBe(1);
	expect((await bindings.OTHER.list()).total).toBe(0);
});

test("artifacts: two Workers can share a namespace through different bindings", async ({
	expect,
}) => {
	const worker = (name: string, binding: string) => ({
		config: {
			name,
			compatibilityDate: "2026-09-03",
			env: { [binding]: { type: "artifacts" as const, namespace: "shared" } },
			manifest: singleModuleManifest(SCRIPT),
		},
	});
	const mf = new Miniflare({
		cf: false,
		workers: [worker("first", "REPOS"), worker("second", "ALIAS")],
	});
	useDispose(mf);
	const { REPOS } = await mf.getBindings<{
		REPOS: { create(name: string): Promise<{ name: string }> };
	}>("first");
	const { ALIAS } = await mf.getBindings<{
		ALIAS: { list(): Promise<{ total: number }> };
	}>("second");
	await REPOS.create("shared-repo");
	expect((await ALIAS.list()).total).toBe(1);
});

test("artifacts: native Git reads commits, trees, blobs and files", async ({
	expect,
}) => {
	const mf = new Miniflare(options());
	useDispose(mf);
	const source = path.join(await useTmp(), "source");
	await pushFixture(mf, source);
	const { stdout } = await git(["rev-parse", "HEAD"], source);
	const hash = stdout.trim();
	const commit = await rpc(mf, "readCommit", [hash], "Repo");
	expect(commit.hash).toBe(hash);
	expect((await rpc(mf, "log", [], "Repo"))[0].hash).toBe(hash);
	const tree = await rpc(mf, "readTree", [commit.treeHash], "Repo");
	const entry = tree.find(({ name }: { name: string }) => name === "hello.txt");
	expect(entry).toBeDefined();
	expect((await rpc(mf, "readBlob", [entry.hash], "Repo")).bytes).toEqual([
		...new TextEncoder().encode("hello artifacts\n"),
	]);
	expect(
		await rpc(mf, "readFile", [{ ref: "main", path: "hello.txt" }], "Repo")
	).toEqual({
		bytes: [...new TextEncoder().encode("hello artifacts\n")],
		type: "text/plain;charset=utf-8",
	});
	expect(
		await rpc(mf, "readFile", [{ ref: "main", path: "bytes.bin" }], "Repo")
	).toEqual({ bytes: [0, 255, 128, 1], type: "application/octet-stream" });
});

test("artifacts: native Git push/clone and token revocation", async ({
	expect,
}) => {
	const mf = new Miniflare(options());
	useDispose(mf);
	const directory = await useTmp();
	const created = await pushFixture(mf, path.join(directory, "source"));
	expect(new URL(created.remote).hostname).toBe("127.0.0.1");
	const token = await rpc(mf, "createToken", ["read"], "Repo");
	await git([
		"-c",
		`http.extraHeader=Authorization: Bearer ${token.plaintext}`,
		"clone",
		created.remote.replace("Repo.git", "repo.git"),
		path.join(directory, "clone"),
	]);
	expect(
		await readFile(path.join(directory, "clone", "hello.txt"), "utf8")
	).toBe("hello artifacts\n");
	const advertise = `${created.remote}/info/refs?service=git-upload-pack`;
	const discovery = await fetch(advertise, {
		headers: {
			Authorization: `Bearer ${token.plaintext}`,
			"Git-Protocol": "version=2",
		},
	});
	expect(discovery.status).toBe(200);
	expect(discovery.headers.get("content-type")).toContain(
		"git-upload-pack-advertisement"
	);
	await discovery.body?.cancel();
	const unsupported = await fetch(`${created.remote}/HEAD`, {
		headers: { Authorization: `Bearer ${created.token}` },
	});
	expect(unsupported.status).toBe(404);
	await unsupported.body?.cancel();
	const unauthenticated = await fetch(advertise);
	expect(unauthenticated.status).toBe(401);
	await unauthenticated.body?.cancel();
	await rpc(mf, "revokeToken", [token.id], "Repo");
	const revoked = await fetch(advertise, {
		headers: { Authorization: `Bearer ${token.plaintext}` },
	});
	expect(revoked.status).toBe(401);
	await revoked.body?.cancel();
});

test("artifacts: read-only and read-scoped tokens reject Git pushes", async ({
	expect,
}) => {
	const mf = new Miniflare(options());
	useDispose(mf);
	const directory = await useTmp();
	const writable = await pushFixture(mf, path.join(directory, "source"));
	const readToken = await rpc(mf, "createToken", ["read"], "Repo");
	const withReadToken = await fetch(
		`${writable.remote}/info/refs?service=git-receive-pack`,
		{
			headers: { Authorization: `Bearer ${readToken.plaintext}` },
		}
	);
	expect(withReadToken.status).toBe(403);
	await withReadToken.body?.cancel();
	const readOnly = await rpc(
		mf,
		"fork",
		["read-only", { readOnly: true }],
		"Repo"
	);
	const writeAttempt = await fetch(
		`${readOnly.remote}/info/refs?service=git-receive-pack`,
		{
			headers: { Authorization: `Bearer ${readOnly.token}` },
		}
	);
	expect(writeAttempt.status).toBe(403);
	await writeAttempt.body?.cancel();
	const readAttempt = await fetch(
		`${readOnly.remote}/info/refs?service=git-upload-pack`,
		{ headers: { Authorization: `Bearer ${readOnly.token}` } }
	);
	expect(readAttempt.status).toBe(200);
	await readAttempt.body?.cancel();
});

test("artifacts: metadata and Git data survive restart and binding rename", async ({
	expect,
}) => {
	const root = await useTmp();
	const first = new Miniflare({ ...options(), resourcePersistencePath: root });
	useDispose(first);
	const created = await pushFixture(first, path.join(await useTmp(), "source"));
	await first.dispose();
	const second = new Miniflare({
		...options("test", "RENAMED"),
		resourcePersistencePath: root,
	});
	useDispose(second);
	const { RENAMED } = await second.getBindings<{
		RENAMED: {
			get(name: string): Promise<{
				info(): Promise<{ id: string; remote: string }>;
				readFile(args: { ref: string; path: string }): Promise<Blob>;
			}>;
		};
	}>();
	const repo = await RENAMED.get("repo");
	const info = await repo.info();
	expect(info.id).toBe(created.id);
	expect(
		await (await repo.readFile({ ref: "main", path: "hello.txt" })).text()
	).toBe("hello artifacts\n");
	const response = await fetch(
		`${info.remote}/info/refs?service=git-upload-pack`,
		{ headers: { Authorization: `Bearer ${created.token}` } }
	);
	expect(response.status).toBe(200);
	await response.body?.cancel();
});

test("artifacts: namespaces and instances are isolated; reload preserves state", async ({
	expect,
}) => {
	const first = new Miniflare(options());
	const second = new Miniflare(options());
	useDispose(first);
	useDispose(second);
	await rpc(first, "create", ["repo"]);
	expect((await rpc(second, "list")).total).toBe(0);
	await first.setOptions(options());
	expect((await rpc(first, "list")).total).toBe(1);
	await first.setOptions(options("another"));
	expect((await rpc(first, "list")).total).toBe(0);
});

test("artifacts: lists pages and deletes a repository and its handle", async ({
	expect,
}) => {
	const mf = new Miniflare(options());
	useDispose(mf);
	for (const name of ["one", "two", "three"]) {
		await rpc(mf, "create", [name]);
	}
	const first = await rpc(mf, "list", [{ limit: 2 }]);
	expect(first).toMatchObject({ total: 3 });
	expect(first.repos).toHaveLength(2);
	expect(first.repos[0]).toMatchObject({
		status: "ready",
		jurisdiction: "unrestricted",
	});
	expect(first.cursor).toEqual(expect.any(String));
	const second = await rpc(mf, "list", [{ limit: 2, cursor: first.cursor }]);
	expect(second).toMatchObject({ total: 3 });
	expect(second.repos).toHaveLength(1);
	expect(second.cursor).toBeUndefined();
	expect(
		[...first.repos, ...second.repos].map((repo) => repo.name).sort()
	).toEqual(["one", "three", "two"]);
	const { REPOS } = await mf.getBindings<{
		REPOS: {
			get(name: string): Promise<{ info(): Promise<{ name: string }> }>;
		};
	}>();
	const handle = await REPOS.get("ONE");
	expect((await handle.info()).name).toBe("one");
	expect(await rpc(mf, "delete", ["one"])).toBe(true);
	await expect(async () => handle.info()).rejects.toThrow(/not found/i);
	expect(await rpcFailure(mf, "get", ["one"])).toMatchObject({
		code: "NOT_FOUND",
	});
	expect((await rpc(mf, "list")).total).toBe(2);
});

test("artifacts: token metadata, revocation and validation", async ({
	expect,
}) => {
	const mf = new Miniflare(options());
	useDispose(mf);
	const created = await rpc(mf, "create", ["repo"]);
	const readToken = await rpc(mf, "createToken", ["read", 60], "repo");
	expect(readToken).toMatchObject({
		scope: "read",
		expiresAt: expect.any(String),
	});
	const listed = await rpc(mf, "listTokens", [], "repo");
	expect(listed.total).toBe(2);
	expect(JSON.stringify(listed)).not.toContain(created.token);
	expect(JSON.stringify(listed)).not.toContain(readToken.plaintext);
	expect(
		listed.tokens.every((token: { state: string }) => token.state === "active")
	).toBe(true);
	expect(await rpc(mf, "revokeToken", [readToken.plaintext], "repo")).toBe(
		true
	);
	expect(await rpc(mf, "revokeToken", [readToken.id], "repo")).toBe(false);
	expect((await rpc(mf, "listTokens", [], "repo")).total).toBe(1);
	expect(
		await rpcFailure(mf, "createToken", ["write", 59], "repo")
	).toMatchObject({
		status: 400,
		name: "ArtifactsError",
		code: "INVALID_TTL",
	});
	expect(
		await rpcFailure(mf, "createToken", ["write", 31_536_001], "repo")
	).toMatchObject({
		code: "INVALID_TTL",
	});
	expect(await rpcFailure(mf, "revokeToken", ["bad"], "repo")).toMatchObject({
		code: "INVALID_INPUT",
	});
});

test("artifacts: rejects invalid inputs and returns null for missing objects", async ({
	expect,
}) => {
	const mf = new Miniflare(options());
	useDispose(mf);
	expect(await rpcFailure(mf, "create", ["invalid/name"])).toMatchObject({
		code: "INVALID_REPO_NAME",
		numericCode: 10101,
	});
	await rpc(mf, "create", ["repo"]);
	expect(await rpcFailure(mf, "list", [{ limit: 0 }])).toMatchObject({
		code: "INVALID_INPUT",
	});
	expect(await rpcFailure(mf, "readBlob", ["bad"], "repo")).toMatchObject({
		code: "INVALID_INPUT",
	});
	const absentHash = "0".repeat(40);
	expect(await rpc(mf, "readBlob", [absentHash], "repo")).toBeNull();
	expect(await rpc(mf, "readTree", [absentHash], "repo")).toBeNull();
	expect(await rpc(mf, "readCommit", [absentHash], "repo")).toBeNull();
	expect(
		await rpc(mf, "readFile", [{ ref: "main", path: "missing" }], "repo")
	).toBeNull();
	expect(
		await rpcFailure(mf, "readFile", [{ ref: "main" }], "repo")
	).toMatchObject({
		code: "INVALID_INPUT",
	});
	expect(await rpcFailure(mf, "log", [{ limit: 0 }], "repo")).toMatchObject({
		code: "INVALID_INPUT",
	});
	expect(
		await rpcFailure(mf, "import", [
			{
				source: { url: "http://example.test/repo.git" },
				target: { name: "imported" },
			},
		])
	).toMatchObject({
		code: "INVALID_INPUT",
	});
	expect(
		await rpcFailure(mf, "import", [
			{ source: { url: "not a url" }, target: { name: "imported" } },
		])
	).toMatchObject({
		code: "INVALID_INPUT",
	});
});

test("artifacts: Git credentials are scoped to the repository and operation", async ({
	expect,
}) => {
	const mf = new Miniflare(options());
	useDispose(mf);
	const first = await rpc(mf, "create", ["first"]);
	const second = await rpc(mf, "create", ["second"]);
	const readToken = await rpc(mf, "createToken", ["read"], "first");
	const firstRead = `${first.remote}/info/refs?service=git-upload-pack`;
	const firstWrite = `${first.remote}/info/refs?service=git-receive-pack`;
	const secondRead = `${second.remote}/info/refs?service=git-upload-pack`;
	const basic = `Basic ${Buffer.from(`git:${readToken.plaintext}`).toString("base64")}`;
	const read = await fetch(firstRead, { headers: { Authorization: basic } });
	expect(read.status).toBe(200);
	await read.body?.cancel();
	const write = await fetch(firstWrite, { headers: { Authorization: basic } });
	expect(write.status).toBe(403);
	await write.body?.cancel();
	const wrongRepo = await fetch(secondRead, {
		headers: { Authorization: `Bearer ${first.token}` },
	});
	expect(wrongRepo.status).toBe(401);
	await wrongRepo.body?.cancel();
});

test("artifacts: forks an empty repo and selects which branches to copy", async ({
	expect,
}) => {
	const mf = new Miniflare(options());
	useDispose(mf);
	await rpc(mf, "create", ["empty"]);
	const emptyFork = await rpc(mf, "fork", ["empty-fork"], "empty");
	expect(emptyFork.defaultBranch).toBe("main");

	const directory = path.join(await useTmp(), "source");
	const created = await pushFixture(mf, directory);
	await git(["checkout", "-b", "feature"], directory);
	await writeFile(path.join(directory, "feature.txt"), "feature branch\n");
	await git(["add", "."], directory);
	await git(["commit", "-m", "feature"], directory);
	await git(
		[
			"-c",
			`http.extraHeader=Authorization: Bearer ${created.token}`,
			"push",
			created.remote,
			"feature",
		],
		directory
	);
	const mainOnly = await rpc(mf, "fork", ["main-only"], "Repo");
	const all = await rpc(
		mf,
		"fork",
		["all", { defaultBranchOnly: false, description: "all refs" }],
		"Repo"
	);
	expect(mainOnly.defaultBranch).toBe("main");
	expect((await rpc(mf, "info", [], "all")).description).toBe("all refs");
	expect(
		await rpc(mf, "readFile", [{ ref: "feature", path: "feature.txt" }], "all")
	).toMatchObject({ bytes: [...new TextEncoder().encode("feature branch\n")] });
	expect(
		await rpc(
			mf,
			"readFile",
			[{ ref: "feature", path: "feature.txt" }],
			"main-only"
		)
	).toBeNull();
	expect(all.token).toEqual(expect.any(String));
});

test("artifacts: log pages commits and files resolve only valid paths", async ({
	expect,
}) => {
	const mf = new Miniflare(options());
	useDispose(mf);
	const directory = path.join(await useTmp(), "source");
	const created = await pushFixture(mf, directory);
	const firstHash = (await git(["rev-parse", "HEAD"], directory)).stdout.trim();
	await writeFile(path.join(directory, "second.txt"), "second\n");
	await mkdir(path.join(directory, "folder"));
	await writeFile(path.join(directory, "folder", "nested.txt"), "nested\n");
	await git(["add", "."], directory);
	await git(["commit", "-m", "second"], directory);
	await git(
		[
			"-c",
			`http.extraHeader=Authorization: Bearer ${created.token}`,
			"push",
			created.remote,
			"main",
		],
		directory
	);
	const secondHash = (
		await git(["rev-parse", "HEAD"], directory)
	).stdout.trim();
	expect(
		(await rpc(mf, "log", [{ limit: 1 }], "Repo")).map(
			(commit: { hash: string }) => commit.hash
		)
	).toEqual([secondHash]);
	expect(
		(await rpc(mf, "log", [{ limit: 1, offset: 1 }], "Repo")).map(
			(commit: { hash: string }) => commit.hash
		)
	).toEqual([firstHash]);
	expect(
		await rpc(mf, "readFile", [{ ref: "main", path: "../hello.txt" }], "Repo")
	).toBeNull();
	expect(
		await rpc(mf, "readFile", [{ ref: "main", path: "folder" }], "Repo")
	).toBeNull();
	expect(
		await rpc(
			mf,
			"readFile",
			[{ ref: "main", path: "folder/nested.txt" }],
			"Repo"
		)
	).toMatchObject({ bytes: [...new TextEncoder().encode("nested\n")] });
	expect(
		await rpc(mf, "readFile", [{ ref: "main", path: "missing" }], "Repo")
	).toBeNull();
	expect(
		await rpc(mf, "readFile", [{ ref: "missing", path: "hello.txt" }], "Repo")
	).toBeNull();
});

test("artifacts: concurrent creations serialize without duplicate repositories", async ({
	expect,
}) => {
	const mf = new Miniflare(options());
	useDispose(mf);
	await Promise.all(
		Array.from({ length: 8 }, (_, index) =>
			rpc(mf, "create", [`repo-${index}`])
		)
	);
	const duplicate = await Promise.allSettled([
		rpc(mf, "create", ["same"]),
		rpc(mf, "create", ["same"]),
	]);
	expect(duplicate.map((result) => result.status).sort()).toEqual([
		"fulfilled",
		"rejected",
	]);
	expect((await rpc(mf, "list")).total).toBe(9);
});

test("artifacts: an explicit reset removes both metadata and Git repositories", async ({
	expect,
}) => {
	const persistence = await useTmp();
	const first = new Miniflare({
		...options(),
		resourcePersistencePath: persistence,
	});
	useDispose(first);
	const created = await pushFixture(first, path.join(await useTmp(), "source"));
	await first.dispose();
	await removeDir(path.join(persistence, "artifacts"));
	const second = new Miniflare({
		...options(),
		resourcePersistencePath: persistence,
	});
	useDispose(second);
	expect((await rpc(second, "list")).total).toBe(0);
	const fresh = await rpc(second, "create", ["Repo"]);
	expect(fresh.id).not.toBe(created.id);
	const oldToken = await fetch(
		`${fresh.remote}/info/refs?service=git-upload-pack`,
		{ headers: { Authorization: `Bearer ${created.token}` } }
	);
	expect(oldToken.status).toBe(401);
	await oldToken.body?.cancel();
});

test("artifacts: native Git absence fails before starting a sidecar listener", async ({
	expect,
}) => {
	const root = await useTmp();
	const previousPath = process.env.PATH;
	process.env.PATH = root;
	try {
		await expect(startGitSidecar(path.join(root, "repos"))).rejects.toThrow(
			/spawn git|ENOENT/
		);
	} finally {
		process.env.PATH = previousPath;
	}
});

test("artifacts: disposing the sidecar closes its private listener", async ({
	expect,
}) => {
	const sidecar = await startGitSidecar(path.join(await useTmp(), "repos"));
	const address = `http://${sidecar.address}/missing`;
	try {
		const response = await fetch(address, {
			headers: { "X-Local-Artifacts-Backend": sidecar.secret },
		});
		expect(response.status).toBe(404);
		await response.body?.cancel();
	} finally {
		await sidecar.close();
	}
	await expect(fetch(address)).rejects.toThrow();
});
