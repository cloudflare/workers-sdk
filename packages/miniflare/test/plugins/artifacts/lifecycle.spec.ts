import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { transform } from "esbuild";
import { Miniflare } from "miniflare";
import { test } from "vitest";
import { singleModuleManifest, useDispose, useTmp } from "../../test-shared";
import type { MiniflareOptions } from "miniflare";

const namespace = "lifecycle";
const workerSource = path.resolve(
	__dirname,
	"../../../src/workers/artifacts/binding.worker.ts"
);
const clientScript = `
export default {
  async fetch(request, env) {
    const { method, name, args = [] } = await request.json();
    try {
      const target = name === undefined ? env.REPOS : await env.REPOS.get(name);
      return Response.json(await target[method](...args));
    } catch (error) {
      return Response.json({ code: error.code, message: error.message }, { status: 400 });
    }
  }
};`;

function options(persistencePath?: string): MiniflareOptions {
	return {
		cf: false,
		...(persistencePath === undefined
			? {}
			: { resourcePersistencePath: persistencePath }),
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2026-09-03",
					env: { REPOS: { type: "artifacts", namespace } },
					manifest: singleModuleManifest(clientScript),
				},
			},
		],
	};
}

type RpcResult = Record<string, unknown>;

async function rpc(
	mf: Miniflare,
	method: string,
	args: unknown[] = [],
	name?: string
): Promise<RpcResult> {
	const response = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({ method, args, name }),
	});
	const result = (await response.json()) as RpcResult;
	if (!response.ok) {
		throw new Error(String(result.message));
	}
	return result;
}

// This variant runs the actual binding worker and its DO inside workerd. Only
// this test's source is rewritten: there is no clock endpoint in shipped code.
async function clockedWorker(): Promise<string> {
	let source = await readFile(workerSource, "utf8");
	const replacements = [
		["const createdAt = new Date();", "const createdAt = new Date(testClock);"],
		[
			"return Date.parse(token.expiresAt) > Date.now();",
			"return Date.parse(token.expiresAt) > testClock;",
		],
		[
			"\t// The resolved tail lets the first mutation run immediately.",
			"\tsetTestClock(time: number): void { testClock = time; }\n\t// The resolved tail lets the first mutation run immediately.",
		],
	];
	for (const [original, replacement] of replacements) {
		if (source.split(original).length !== 2) {
			throw new Error(`Artifacts clock test source changed: ${original}`);
		}
		source = source.replace(original, replacement);
	}
	source = `let testClock = 0;\n${source}\n${clockedFetch}`;
	return (await transform(source, { loader: "ts", format: "esm" })).code;
}

const clockedFetch = `
export default {
  async fetch(request, env) {
    const { action, name, method, args = [], time, token, scope } = await request.json();
    const namespace = env.localArtifactsNamespace;
    const state = namespace.get(namespace.idFromName("lifecycle"));
    if (action === "clock") {
      await state.setTestClock(time);
      return Response.json(true);
    }
    if (action === "git") {
      return state.fetch(new Request(
        "http://localhost/git/lifecycle/repo.git/info/refs?service=git-" + scope + "-pack",
        { headers: { Authorization: "Bearer " + token } }
      ));
    }
    try {
      const target = name === undefined ? state : await state.get(name);
      return Response.json(await target[method](...args));
    } catch (error) {
      return Response.json({ code: error.code, message: error.message }, { status: 400 });
    }
  }
};`;

function clockOptions(
	script: string,
	persistencePath?: string
): MiniflareOptions {
	return {
		cf: false,
		...(persistencePath === undefined
			? {}
			: { resourcePersistencePath: persistencePath }),
		workers: [
			{
				config: {
					name: "clocked",
					compatibilityDate: "2026-09-03",
					manifest: singleModuleManifest(script),
					env: {
						config: {
							type: "json",
							value: { namespace, origin: "http://localhost" },
						},
						localArtifactsNamespace: {
							type: "durable-object",
							worker: "clocked",
							exportName: "LocalArtifactsNamespaceObject",
						},
						gitBackend: { type: "worker", worker: "backend" },
					},
					exports: {
						LocalArtifactsNamespaceObject: {
							type: "durable-object",
							storage: "sqlite",
						},
					},
				},
			},
			{
				config: {
					name: "backend",
					compatibilityDate: "2026-09-03",
					manifest: singleModuleManifest(`export default {
            async fetch(request) {
              if (new URL(request.url).pathname !== "/__local_artifacts__")
                return new Response("Git advertisement", { status: 200 });
              const { action } = await request.json();
              if (action === "create" || action === "fork")
                return Response.json({ defaultBranch: "main", refs: {} });
              return Response.json({ refs: {} });
            }
          }`),
				},
			},
		],
	};
}

async function clockRequest(
	mf: Miniflare,
	request: Record<string, unknown>
): Promise<Response> {
	return mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify(request),
	});
}

async function setClock(mf: Miniflare, time: number): Promise<void> {
	const response = await clockRequest(mf, { action: "clock", time });
	await response.body?.cancel();
}

async function clockRpc(
	mf: Miniflare,
	method: string,
	args: unknown[] = [],
	name?: string
): Promise<RpcResult> {
	const response = await clockRequest(mf, { method, args, name });
	const result = (await response.json()) as RpcResult;
	if (!response.ok) {
		throw new Error(JSON.stringify(result));
	}
	return result;
}

async function gitStatus(
	mf: Miniflare,
	token: string,
	scope: "upload" | "receive"
): Promise<number> {
	const response = await clockRequest(mf, {
		action: "git",
		token,
		scope,
	});
	await response.body?.cancel();
	return response.status;
}

const start = Date.parse("2026-01-01T00:00:00.000Z");

test("artifacts: token expiry is exclusive at the exact workerd clock boundary and persists", async ({
	expect,
}) => {
	const script = await clockedWorker();
	const root = await useTmp();
	const first = new Miniflare(clockOptions(script, root));
	useDispose(first);
	await setClock(first, start);
	await clockRpc(first, "create", ["repo"]);
	const read = await clockRpc(first, "createToken", ["read", 60], "repo");
	const write = await clockRpc(first, "createToken", ["write", 60], "repo");
	const expiration = start + 60_000;
	expect(read.expiresAt).toBe(new Date(expiration).toISOString());
	expect(String(read.plaintext)).toContain(`?expires=${expiration / 1000}`);
	expect(write.expiresAt).toBe(read.expiresAt);
	const beforeExpiry = await clockRpc(first, "listTokens", [], "repo");
	expect(beforeExpiry.tokens).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				id: read.id,
				scope: "read",
				state: "active",
				expiresAt: read.expiresAt,
			}),
			expect.objectContaining({
				id: write.id,
				scope: "write",
				state: "active",
				expiresAt: write.expiresAt,
			}),
		])
	);
	expect(JSON.stringify(beforeExpiry)).not.toContain(String(read.plaintext));
	await setClock(first, expiration - 1);
	expect((await clockRpc(first, "listTokens", [], "repo")).total).toBe(3);
	expect(await gitStatus(first, String(read.plaintext), "upload")).toBe(200);
	expect(await gitStatus(first, String(read.plaintext), "receive")).toBe(403);
	expect(await gitStatus(first, String(write.plaintext), "receive")).toBe(200);
	expect(await gitStatus(first, String(write.plaintext), "upload")).toBe(200);

	await setClock(first, expiration);
	expect((await clockRpc(first, "listTokens", [], "repo")).total).toBe(1);
	expect(await gitStatus(first, String(read.plaintext), "upload")).toBe(401);
	expect(await gitStatus(first, String(write.plaintext), "receive")).toBe(401);
	expect(await gitStatus(first, String(read.plaintext), "receive")).toBe(401);
	await first.dispose();

	const restarted = new Miniflare(clockOptions(script, root));
	useDispose(restarted);
	await setClock(restarted, expiration + 1);
	expect((await clockRpc(restarted, "listTokens", [], "repo")).total).toBe(1);
	expect(await gitStatus(restarted, String(write.plaintext), "upload")).toBe(
		401
	);
	expect(await gitStatus(restarted, String(read.plaintext), "upload")).toBe(
		401
	);
	const replacement = await clockRpc(
		restarted,
		"createToken",
		["read", 60],
		"repo"
	);
	expect(
		await gitStatus(restarted, String(replacement.plaintext), "upload")
	).toBe(200);
	expect(
		await clockRpc(restarted, "revokeToken", [replacement.id], "repo")
	).toBe(true);
	expect(
		await gitStatus(restarted, String(replacement.plaintext), "upload")
	).toBe(401);
});

test("artifacts: concurrent same-name creates and forks commit one winner each", async ({
	expect,
}) => {
	const mf = new Miniflare(options());
	useDispose(mf);
	await rpc(mf, "create", ["source"]);
	const creates = await Promise.allSettled([
		rpc(mf, "create", ["Target"]),
		rpc(mf, "create", ["target"]),
	]);
	expect(creates.map((result) => result.status).sort()).toEqual([
		"fulfilled",
		"rejected",
	]);
	const forks = await Promise.allSettled([
		rpc(mf, "fork", ["Child"], "source"),
		rpc(mf, "fork", ["child"], "source"),
	]);
	expect(forks.map((result) => result.status).sort()).toEqual([
		"fulfilled",
		"rejected",
	]);
	expect((await rpc(mf, "list")).total).toBe(3);
	const child = await rpc(mf, "info", [], "child");
	expect(child.source).toBe(`artifacts:${namespace}/source`);
});

test("artifacts: import and fork metadata remain distinct across concurrent creations", async ({
	expect,
}) => {
	// The backend is a local stub: this exercises namespace state transitions,
	// not network cloning (which is covered by the native Git tests).
	const mf = new Miniflare(clockOptions(await clockedWorker()));
	useDispose(mf);
	const results = await Promise.allSettled([
		clockRpc(mf, "import", [
			{
				source: {
					url: "https://example.com/source.git",
					branch: "release",
					depth: 1,
				},
				target: { name: "Imported", opts: { description: "remote copy" } },
			},
		]),
		clockRpc(mf, "import", [
			{
				source: { url: "https://example.com/other.git" },
				target: { name: "imported" },
			},
		]),
	]);
	expect(results.map((result) => result.status).sort()).toEqual([
		"fulfilled",
		"rejected",
	]);
	const imported = await clockRpc(mf, "info", [], "imported");
	expect(imported.source).toMatch(
		/^git:https:\/\/example\.com\/(source|other)\.git$/
	);
	const fork = await clockRpc(
		mf,
		"fork",
		["forked", { readOnly: true }],
		"imported"
	);
	expect(fork.name).toBe("forked");
	expect(await clockRpc(mf, "info", [], "forked")).toMatchObject({
		readOnly: true,
		source: `artifacts:${namespace}/${imported.name}`,
	});
	expect((await clockRpc(mf, "list")).total).toBe(2);
});

test("artifacts: concurrent independent mutations preserve all repositories and tokens", async ({
	expect,
}) => {
	const mf = new Miniflare(options());
	useDispose(mf);
	await Promise.all(
		["one", "two", "three"].map((name) => rpc(mf, "create", [name]))
	);
	await Promise.all(
		["one", "two", "three"].map(async (name) => {
			await Promise.all([
				rpc(mf, "createToken", ["read", 60], name),
				rpc(mf, "fork", [`${name}-fork`], name),
			]);
		})
	);
	for (const name of ["one", "two", "three"]) {
		expect((await rpc(mf, "listTokens", [], name)).total).toBe(2);
		expect((await rpc(mf, "info", [], `${name}-fork`)).source).toBe(
			`artifacts:${namespace}/${name}`
		);
	}
	expect((await rpc(mf, "list")).total).toBe(6);
});

async function killChild(child: ReturnType<typeof spawn>): Promise<void> {
	if (child.exitCode !== null || child.pid === undefined) {
		return;
	}
	const closed = once(child, "close");
	if (process.platform === "win32") {
		// Killing only Node would orphan workerd and leave its listener and
		// SQLite files open. taskkill /T stops the entire child process tree.
		await promisify(execFile)("taskkill", [
			"/PID",
			String(child.pid),
			"/T",
			"/F",
		]);
	} else {
		try {
			process.kill(-child.pid, "SIGKILL");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
				throw error;
			}
		}
	}
	await closed;
}

// The child deliberately never calls dispose(): the parent kills it after
// create() has committed, then starts a new listener against the same root.
test("artifacts: abrupt child-process exit leaves committed repositories restartable", async ({
	expect,
}) => {
	const root = await useTmp();
	const marker = path.join(root, "ready");
	const childScript = path.join(root, "child.cjs");
	const modulePath = path.resolve(__dirname, "../../../dist/src/index.js");
	await writeFile(
		childScript,
		`
const { Miniflare } = require(${JSON.stringify(modulePath)});
const { writeFileSync } = require("node:fs");
const mf = new Miniflare({
  cf: false,
  resourcePersistencePath: ${JSON.stringify(root)},
  workers: [{ config: {
    name: "", compatibilityDate: "2026-09-03",
    env: { REPOS: { type: "artifacts", namespace: "lifecycle" } },
    manifest: { mainModule: "index.mjs", modulesRoot: ${JSON.stringify(root)}, modules: { "index.mjs": { type: "esm", contents: "export default { fetch() { return new Response('ok') } }" } } }
  }}]
});
(async () => {
  const { REPOS } = await mf.getBindings();
  const created = await REPOS.create("survivor");
  writeFileSync(${JSON.stringify(marker)}, JSON.stringify(created));
  process.stdout.write("READY\\n");
})().catch(error => { process.stderr.write(String(error)); process.exitCode = 1; });
`
	);
	const child = spawn(process.execPath, [childScript], {
		stdio: ["ignore", "pipe", "pipe"],
		// workerd is a subprocess: kill the process group to avoid orphaning it.
		detached: process.platform !== "win32",
	});
	let listener = "";
	let token = "";
	let stderr = "";
	child.stderr?.on("data", (chunk: Buffer) => {
		stderr += chunk.toString();
	});
	try {
		if (child.stdout === null) {
			throw new Error("Child stdout pipe unavailable");
		}
		await Promise.race([
			once(child.stdout, "data", { signal: AbortSignal.timeout(15_000) }),
			once(child, "exit").then(() => {
				throw new Error(`Child exited before ready: ${stderr}`);
			}),
		]);
		const created = JSON.parse(await readFile(marker, "utf8")) as {
			remote: string;
			token: string;
		};
		expect(created.remote).toMatch(/^http:\/\/127\.0\.0\.1:/);
		listener = `${created.remote}/info/refs?service=git-upload-pack`;
		token = created.token;
	} finally {
		await killChild(child);
	}
	await expect(
		fetch(listener, { signal: AbortSignal.timeout(2_000) })
	).rejects.toThrow();
	const restarted = new Miniflare(options(root));
	useDispose(restarted);
	const info = await rpc(restarted, "info", [], "survivor");
	expect(info.name).toBe("survivor");
	const advertised = await fetch(
		`${info.remote}/info/refs?service=git-upload-pack`,
		{
			headers: { Authorization: `Bearer ${token}` },
		}
	);
	expect(advertised.status).toBe(200);
	await advertised.body?.cancel();
	const created = await rpc(restarted, "create", ["after-restart"]);
	expect(created.name).toBe("after-restart");
	expect((await rpc(restarted, "list")).total).toBe(2);
});
