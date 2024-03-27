import assert from "node:assert";
import childProcess from "node:child_process";
import crypto from "node:crypto";
import events from "node:events";
import fs from "node:fs/promises";
import rl from "node:readline";
import { ReadableStream } from "node:stream/web";
import { setTimeout } from "node:timers/promises";
import getPort from "get-port";
import stripAnsi from "strip-ansi";
import { Agent, fetch } from "undici";
import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { dedent, makeRoot, seed } from "./helpers/setup";
import { teardown } from "./helpers/teardown";
import { WRANGLER } from "./helpers/wrangler-command";

// =============================================================================
// Configuration
// =============================================================================

const PIPE_OUTPUT = false;
const RUNTIMES = [{ runtime: "local" }, { runtime: "remote" }] as const;

// =============================================================================
// Helpers
// =============================================================================

async function exec(command: string, cwd?: string): Promise<string> {
	const child = childProcess.spawn(command, {
		cwd,
		env: process.env,
		shell: true,
		stdio: "pipe",
	});

	const lines: string[] = [];
	const stdoutInterface = rl.createInterface(child.stdout);
	const stderrInterface = rl.createInterface(child.stderr);
	stdoutInterface.on("line", (line) => {
		lines.push(line);
		if (PIPE_OUTPUT) console.log(line);
	});
	stderrInterface.on("line", (line) => {
		lines.push(line);
		if (PIPE_OUTPUT) console.error(line);
	});

	const [exitCode] = await events.once(child, "exit");
	if (exitCode !== 0) {
		lines.unshift(`Failed to run ${JSON.stringify(command)}:`);
		throw new Error(lines.join("\n"));
	}

	return lines.join("\n");
}

async function readUntil(
	lines: ReadableStream<string>,
	regExp: RegExp,
	timeout = 10_000
): Promise<RegExpMatchArray> {
	const timeoutPromise = setTimeout(timeout, false as const);
	const reader = lines.getReader();
	const readArray: string[] = [];
	const read = () => stripAnsi(readArray.join("\n"));
	try {
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const result = await Promise.race([reader.read(), timeoutPromise]);
			if (result === false) {
				throw new Error(`Timed out matching ${regExp}:\n${read()}`);
			}
			if (result.done) {
				throw new Error(`Exhausted matching ${regExp}:\n${read()}`);
			}
			const match = result.value.match(regExp);
			if (match !== null) return match;
			readArray.push(result.value);
		}
	} finally {
		reader.releaseLock();
	}
}

// =============================================================================
// Resources
// =============================================================================

function generateResourceName(type = "worker") {
	return `wrangler-e2e-${type}-${crypto.randomUUID()}`;
}

// WebAssembly module containing single `func add(i32, i32): i32` export.
// Generated using https://webassembly.github.io/wabt/demo/wat2wasm/.
const WASM_ADD_MODULE = Buffer.from(
	"AGFzbQEAAAABBwFgAn9/AX8DAgEABwcBA2FkZAAACgkBBwAgACABagsACgRuYW1lAgMBAAA=",
	"base64"
);

// TODO: when we switch to TypeScript 5, actually use `using` keyword here,
//  should be able to make these tests concurrent if we do.
//  could also add a key to context: https://vitest.dev/guide/test-context.html

interface TemporaryDirectory {
	path: string;
	seed(files: Record<string, string | Uint8Array>): Promise<void>;
	exec(strings: TemplateStringsArray, ...args: unknown[]): Promise<string>;
}
async function usingTmpDir(): Promise<TemporaryDirectory> {
	const tmpPath = await makeRoot();
	teardown(() => fs.rm(tmpPath, { recursive: true, maxRetries: 10 }));
	return {
		path: tmpPath,
		seed(files) {
			return seed(tmpPath, files);
		},
		exec(strings, ...args) {
			return exec(String.raw(strings, ...args), tmpPath);
		},
	};
}

type Worker = URL & { lines: ReadableStream<string> };
async function usingDevWorker(cwd: string, ...flags: string[]) {
	// Start `wrangler dev` on random port
	const port = await getPort();
	const flagsString = flags.join(" ");
	const command = `${WRANGLER} dev --ip=127.0.0.1 --port=${port} ${flagsString}`;
	const child = childProcess.spawn(command, {
		cwd,
		env: process.env,
		shell: true,
		stdio: "pipe",
	});

	// const readyPromise = new DeferredPromise<true>();
	const exitPromise = events.once(child, "exit");

	// Shutdown `wrangler dev` on test cleanup
	teardown(() => {
		child.kill();
		return exitPromise;
	});

	const lines = new ReadableStream<string>({
		start(controller) {
			const stdoutInterface = rl.createInterface(child.stdout);
			const stderrInterface = rl.createInterface(child.stderr);
			stdoutInterface.on("line", (line) => {
				controller.enqueue(line);
				if (PIPE_OUTPUT) console.log(line);
			});
			stderrInterface.on("line", (line) => {
				controller.enqueue(line);
				if (PIPE_OUTPUT) console.error(line);
			});
			void exitPromise.then(() => controller.close());
		},
	});

	// Wait for Wrangler to be ready or to crash
	await readUntil(lines, /Ready on|Listening at/);

	const isSecure = flags.some((flag) => /--local-protocol[ =]https/.test(flag));
	const protocol = isSecure ? "https" : "http";
	const worker = new URL(`${protocol}://127.0.0.1:${port}`) as Worker;
	worker.lines = lines;
	return worker;
}

async function _usingDeployedWorker(_cwd: string): Promise<URL> {
	// TODO(soon): for testing service bindings in remote
	// TODO(soon): deploy worker
	teardown(() => {
		// TODO(soon): delete worker
	});
	// TODO(soon): return URL to worker
	return new URL("https://workers.dev");
}

async function usingKVNamespace(isLocal: boolean): Promise<string /* id */> {
	const name = generateResourceName("kv").replaceAll("-", "_");
	if (isLocal) return name;

	const result = await exec(`${WRANGLER} kv:namespace create ${name}`);
	const match = /[0-9a-f]{32}/.exec(result);
	assert(match !== null, `Cannot find ID in ${JSON.stringify(result)}`);
	const id = match[0];
	teardown(async () => {
		await exec(`${WRANGLER} kv:namespace delete --namespace-id ${id}`);
	});

	return id;
}

async function usingR2Bucket(isLocal: boolean): Promise<string /* name */> {
	const name = generateResourceName("r2");
	if (isLocal) return name;

	await exec(`${WRANGLER} r2 bucket create ${name}`);
	teardown(async () => {
		await exec(`${WRANGLER} r2 bucket delete ${name}`);
	});

	return name;
}

async function usingD1Database(
	isLocal: boolean
): Promise<{ id: string; name: string }> {
	const name = generateResourceName("d1");
	if (isLocal) return { id: crypto.randomUUID(), name };

	const result = await exec(`${WRANGLER} d1 create ${name}`);
	const match = /database_id = "([0-9a-f-]{36})"/.exec(result);
	assert(match !== null, `Cannot find ID in ${JSON.stringify(result)}`);
	const id = match[1];
	teardown(async () => {
		await exec(`${WRANGLER} d1 delete -y ${name}`);
	});

	return { id, name };
}

// =============================================================================
// Tests
// =============================================================================

describe.each(RUNTIMES)("Core: $runtime", ({ runtime }) => {
	const isLocal = runtime === "local";
	const runtimeFlags = isLocal ? [] : ["--remote"];

	it("works with basic modules format worker", async () => {
		const tmp = await usingTmpDir();
		const workerName = generateResourceName();
		await tmp.seed({
			"wrangler.toml": dedent`
				name = "${workerName}"
				main = "src/index.ts"
				compatibility_date = "2023-01-01"
			`,
			"src/index.ts": dedent`
				export default {
					fetch(request, env, ctx) {
						const { pathname } = new URL(request.url);
						if (pathname === "/") {
							return new Response("modules");
						} else if (pathname === "/error") {
							throw new Error("🙈");
						} else {
							return new Response(null, { status: 404 });
						}
					}
				}
			`,
		});
		const worker = await usingDevWorker(tmp.path, ...runtimeFlags);
		let res = await fetch(worker);
		expect(await res.text()).toBe("modules");

		res = await fetch(new URL("/error", worker), {
			headers: { Accept: "text/plain" },
		});
		const text = await res.text();
		if (isLocal) {
			expect(text).toContain("Error: 🙈");
			expect(text).toContain("src/index.ts:7:10");
		}
		await readUntil(worker.lines, /Error: 🙈/);
		await readUntil(worker.lines, /src\/index\.ts:7:10/);
	});

	it("works with basic service worker", async () => {
		const tmp = await usingTmpDir();
		const workerName = generateResourceName();
		await tmp.seed({
			"wrangler.toml": dedent`
				name = "${workerName}"
				main = "src/index.ts"
				compatibility_date = "2023-01-01"
			`,
			"src/index.ts": dedent`
				addEventListener("fetch", (event) => {
					const { pathname } = new URL(event.request.url);
					if (pathname === "/") {
						event.respondWith(new Response("service worker"));
					} else if (pathname === "/error") {
						throw new Error("🙈");
					} else {
						event.respondWith(new Response(null, { status: 404 }));
					}
				});
			`,
		});
		const worker = await usingDevWorker(tmp.path, ...runtimeFlags);
		let res = await fetch(worker);
		expect(await res.text()).toBe("service worker");

		res = await fetch(new URL("/error", worker), {
			headers: { Accept: "text/plain" },
		});
		const text = await res.text();
		if (isLocal) {
			expect(text).toContain("Error: 🙈");
			expect(text).toContain("src/index.ts:6:9");
		}
		await readUntil(worker.lines, /Error: 🙈/);
		await readUntil(worker.lines, /src\/index\.ts:6:9/);
	});

	// TODO(now): no bundle? find additional modules?
	it.todo("workers with no bundle");
	it.todo("workers with find additional modules");

	it("respects compatibility settings", async () => {
		const tmp = await usingTmpDir();
		const workerName = generateResourceName();
		// `global_navigator` enabled on `2022-03-21`: https://developers.cloudflare.com/workers/configuration/compatibility-dates/#global-navigator
		// `http_headers_getsetcookie` enabled on `2023-03-01`: https://developers.cloudflare.com/workers/configuration/compatibility-dates/#headers-supports-getsetcookie
		// `2022-03-22` should enable `global_navigator` but disable `http_headers_getsetcookie`
		// `nodejs_compat` has no default-on-date
		await tmp.seed({
			"wrangler.toml": dedent`
				name = "${workerName}"
				main = "src/index.ts"
				compatibility_date = "2022-03-22"
				compatibility_flags = ["nodejs_compat"]
			`,
			"src/index.ts": dedent`
				import { Buffer } from "node:buffer";
				export default {
					fetch() {
						const headers = new Headers([
							["Set-Cookie", "cookie1=🍪"],
							["Set-Cookie", "cookie2=🥠"],
						]);
						return Response.json({
							userAgent: globalThis.navigator?.userAgent,
							cookies: headers.getSetCookie?.() ?? "😈",
							encoded: Buffer.from("🧢").toString("base64"),
						});
					}
				}
			`,
		});
		const worker = await usingDevWorker(tmp.path, ...runtimeFlags);
		const res = await fetch(worker);
		expect(await res.json()).toEqual({
			userAgent: "Cloudflare-Workers",
			cookies: "😈", // No cookies for you!
			encoded: "8J+nog==",
		});
	});

	it("starts inspector and allows debugging", async () => {
		const inspectorPort = await getPort();
		const tmp = await usingTmpDir();
		const workerName = generateResourceName();
		await tmp.seed({
			"wrangler.toml": dedent`
				name = "${workerName}"
				main = "src/index.ts"
				compatibility_date = "2023-01-01"
			`,
			"src/index.ts": dedent`
				export default {
					fetch(request, env, ctx) { return new Response("body"); }
				}
			`,
		});
		await usingDevWorker(
			tmp.path,
			...runtimeFlags,
			`--inspector-port=${inspectorPort}`
		);
		const inspectorUrl = new URL(`ws://127.0.0.1:${inspectorPort}`);
		const ws = new WebSocket(inspectorUrl);
		await events.once(ws, "open");
		ws.close();
		// TODO(soon): once we have inspector proxy worker, write basic tests here,
		//  messages currently to non-deterministic to do this reliably
	});

	it("starts https server", async () => {
		const tmp = await usingTmpDir();
		const workerName = generateResourceName();
		await tmp.seed({
			"wrangler.toml": dedent`
				name = "${workerName}"
				main = "src/index.ts"
				compatibility_date = "2023-01-01"
			`,
			"src/index.ts": dedent`
				export default {
					fetch(request, env, ctx) { return new Response("🔐"); }
				}
			`,
		});
		const worker = await usingDevWorker(
			tmp.path,
			...runtimeFlags,
			"--local-protocol=https"
		);
		expect(worker.protocol).toBe("https:");
		const res = await fetch(worker, {
			dispatcher: new Agent({ connect: { rejectUnauthorized: false } }),
		});
		expect(await res.text()).toBe("🔐");
	});

	it.skipIf(!isLocal)("uses configured upstream inside worker", async () => {
		const tmp = await usingTmpDir();
		const workerName = generateResourceName();
		await tmp.seed({
			"wrangler.toml": dedent`
				name = "${workerName}"
				main = "src/index.ts"
				compatibility_date = "2023-01-01"
			`,
			"src/index.ts": dedent`
				export default {
					fetch(request, env, ctx) { return new Response(request.url); }
				}
			`,
		});
		const worker = await usingDevWorker(
			tmp.path,
			...runtimeFlags,
			// TODO(soon): explore using `--host` for remote mode in this test
			"--local-upstream=example.com"
		);
		const res = await fetch(worker);
		expect(await res.text()).toBe("http://example.com/");
	});
});

describe.each(RUNTIMES)("Bindings: $runtime", ({ runtime }) => {
	const isLocal = runtime === "local";
	const runtimeFlags = isLocal ? [] : ["--remote"];
	const resourceFlags = isLocal ? "--local" : "";

	it("exposes basic bindings", async () => {
		const tmp = await usingTmpDir();
		const workerName = generateResourceName();
		await tmp.seed({
			"data/text.txt": "👋",
			"data/binary.bin": "🌊",
			"wrangler.toml": dedent`
				name = "${workerName}"
				main = "src/index.ts"
				compatibility_date = "2023-01-01"
				[vars]
				TEXT = "📄"
				OBJECT = { charts = "📊" }
				[text_blobs]
				TEXT_BLOB = "data/text.txt"
				[data_blobs]
				DATA_BLOB = "data/binary.bin"
			`,
			"src/index.ts": dedent`
				addEventListener("fetch", (event) => {
					const res = Response.json({
						TEXT,
						OBJECT,
						TEXT_BLOB,
						DATA_BLOB: new TextDecoder().decode(DATA_BLOB)
					});
					event.respondWith(res);
				});
			`,
		});
		const worker = await usingDevWorker(tmp.path, ...runtimeFlags);
		const res = await fetch(worker);
		expect(await res.json()).toEqual({
			TEXT: "📄",
			OBJECT: { charts: "📊" },
			TEXT_BLOB: "👋",
			DATA_BLOB: "🌊",
		});
	});

	it("exposes WebAssembly module bindings in service workers", async () => {
		const tmp = await usingTmpDir();
		const workerName = generateResourceName();
		await tmp.seed({
			"add.wasm": WASM_ADD_MODULE,
			"wrangler.toml": dedent`
				name = "${workerName}"
				main = "src/index.ts"
				compatibility_date = "2023-01-01"
				[wasm_modules]
				ADD_MODULE = "add.wasm"
			`,
			"src/index.ts": dedent`
				addEventListener("fetch", (event) => {
					const instance = new WebAssembly.Instance(ADD_MODULE);
					event.respondWith(new Response(instance.exports.add(1, 2)));
				});
			`,
		});
		const worker = await usingDevWorker(tmp.path, ...runtimeFlags);
		const res = await fetch(worker);
		expect(await res.text()).toBe("3");
	});

	it("exposes KV namespace bindings", async () => {
		const tmp = await usingTmpDir();

		const ns = await usingKVNamespace(isLocal);
		await tmp.exec`${WRANGLER} kv:key put ${resourceFlags} --namespace-id=${ns} existing-key existing-value`;

		const workerName = generateResourceName();
		await tmp.seed({
			"wrangler.toml": dedent`
				name = "${workerName}"
				main = "src/index.ts"
				compatibility_date = "2023-01-01"
				kv_namespaces = [
					{ binding = "NAMESPACE", id = "${ns}", preview_id = "${ns}" }
				]
			`,
			"src/index.ts": dedent`
				export default {
					async fetch(request, env, ctx) {
						const value = await env.NAMESPACE.get("existing-key");
						await env.NAMESPACE.put("new-key", "new-value");
						return new Response(value);
					}
				}
			`,
		});
		const worker = await usingDevWorker(tmp.path, ...runtimeFlags);
		const res = await fetch(worker);
		expect(await res.text()).toBe("existing-value");

		const result =
			await tmp.exec`${WRANGLER} kv:key get ${resourceFlags} --namespace-id=${ns} new-key`;
		// TODO(soon): make this `toBe()` once we remove `Logs were written` message
		expect(result).toContain("new-value");
	});

	it("supports Workers Sites bindings", async () => {
		const tmp = await usingTmpDir();
		const workerName = generateResourceName();
		const kvAssetHandler = require.resolve("@cloudflare/kv-asset-handler");
		await tmp.seed({
			"public/index.html": "<h1>👋</h1>",
			"wrangler.toml": dedent`
				name = "${workerName}"
				main = "src/index.ts"
				compatibility_date = "2023-01-01"
				[site]
				bucket = "./public"
			`,
			"src/index.ts": dedent`
				import { getAssetFromKV, KVError } from ${JSON.stringify(kvAssetHandler)};
				import manifestJSON from "__STATIC_CONTENT_MANIFEST";
				const manifest = JSON.parse(manifestJSON);
				export default {
					async fetch(request, env, ctx) {
						try {
							const waitUntil = ctx.waitUntil.bind(ctx);
							return await getAssetFromKV({ request, waitUntil }, {
								ASSET_NAMESPACE: env.__STATIC_CONTENT,
								ASSET_MANIFEST: manifest,
							});
						} catch (e) {
							if (e instanceof KVError) {
								return new Response(e.message, { status: e.status });
							} else {
								return new Response(String(e), { status: 500 });
							}
						}
					}
				}
			`,
		});

		teardown(async () => {
			// Try clean up created remote Workers Sites namespace
			if (isLocal) return;
			const listResult = await tmp.exec`${WRANGLER} kv:namespace list`;
			// TODO(soon): remove `substring()` once we remove `Logs were written` message
			const list = JSON.parse(
				listResult.substring(0, listResult.lastIndexOf("]") + 1)
			);
			assert(Array.isArray(list));
			const ns = list.find(({ title }) => title.includes(workerName));
			if (ns === undefined) {
				console.warn("Couldn't find Workers Sites namespace to delete");
			} else {
				await tmp.exec`${WRANGLER} kv:namespace delete --namespace-id ${ns.id}`;
			}
		});

		const worker = await usingDevWorker(tmp.path, ...runtimeFlags);
		const res = await fetch(worker);
		expect(await res.text()).toBe("<h1>👋</h1>");
	});

	it("exposes R2 bucket bindings", async () => {
		const tmp = await usingTmpDir();

		await tmp.seed({ "test.txt": "existing-value" });
		const name = await usingR2Bucket(isLocal);
		await tmp.exec`${WRANGLER} r2 object put ${resourceFlags} ${name}/existing-key --file test.txt`;
		teardown(async () => {
			// `wrangler r2 bucket delete` requires the bucket to be empty
			await tmp.exec`${WRANGLER} r2 object delete ${resourceFlags} ${name}/existing-key`;
		});

		const workerName = generateResourceName();
		await tmp.seed({
			"wrangler.toml": dedent`
				name = "${workerName}"
				main = "src/index.ts"
				compatibility_date = "2023-01-01"
				r2_buckets = [
					{ binding = "BUCKET", bucket_name = "${name}", preview_bucket_name = "${name}" }
				]
			`,
			"src/index.ts": dedent`
				export default {
					async fetch(request, env, ctx) {
						const value = await env.BUCKET.get("existing-key");
						await env.BUCKET.put("new-key", "new-value");
						return new Response(value?.body);
					}
				}
			`,
		});
		const worker = await usingDevWorker(tmp.path, ...runtimeFlags);
		const res = await fetch(worker);
		expect(await res.text()).toBe("existing-value");
		teardown(async () => {
			await tmp.exec`${WRANGLER} r2 object delete ${resourceFlags} ${name}/new-key`;
		});

		const result =
			await tmp.exec`${WRANGLER} r2 object get ${resourceFlags} ${name}/new-key --pipe`;
		// TODO(soon): make this `toBe()` once we remove `Logs were written` message
		expect(result).toContain("new-value");
	});

	it("exposes D1 database bindings", async () => {
		const { id, name } = await usingD1Database(isLocal);
		const tmp = await usingTmpDir();
		const workerName = generateResourceName();
		await tmp.seed({
			"wrangler.toml": dedent`
				name = "${workerName}"
				main = "src/index.ts"
				compatibility_date = "2023-01-01"
				[[d1_databases]]
				binding = "DB"
				database_name = "${name}"
				database_id = "${id}"
			`,
			"schema.sql": dedent`
				CREATE TABLE entries (key TEXT PRIMARY KEY, value TEXT);
				INSERT INTO entries (key, value) VALUES ('key1', 'value1');
			`,
			"src/index.ts": dedent`
				export default {
					async fetch(request, env, ctx) {
						await env.DB.prepare("INSERT INTO entries (key, value) VALUES (?, ?)").bind("key2", "value2").run();
						const result = await env.DB.prepare("SELECT * FROM entries WHERE key = 'key1'").all();
						return Response.json(result.results);
					}
				}
			`,
		});
		await tmp.exec`${WRANGLER} d1 execute ${resourceFlags} DB --file schema.sql`;

		const worker = await usingDevWorker(tmp.path, ...runtimeFlags);
		const res = await fetch(worker);
		expect(await res.json()).toEqual([{ key: "key1", value: "value1" }]);

		const result =
			await tmp.exec`${WRANGLER} d1 execute ${resourceFlags} DB --command "SELECT * FROM entries WHERE key = 'key2'"`;
		expect(result).toContain("value2");
	});

	it.skipIf(!isLocal)("exposes queue producer/consumer bindings", async () => {
		const tmp = await usingTmpDir();
		const queueName = generateResourceName("queue");
		const workerName = generateResourceName();
		await tmp.seed({
			"wrangler.toml": dedent`
				name = "${workerName}"
				main = "src/index.ts"
				compatibility_date = "2023-01-01"
				[[queues.producers]]
				queue = "${queueName}"
				binding = "QUEUE"
				[[queues.consumers]]
				queue = "${queueName}"
				max_batch_timeout = 0
			`,
			"src/index.ts": dedent`
				export default {
					async fetch(request, env, ctx) {
						await env.QUEUE.send("✉️");
						return new Response(null, { status: 204 });
					},
					async queue(batch, env, ctx) {
						for (const message of batch.messages) console.log(message.body);
					}
				}
			`,
		});
		const worker = await usingDevWorker(tmp.path, ...runtimeFlags);
		await fetch(worker);
		await readUntil(worker.lines, /✉️/);
	});

	// TODO(soon): implement E2E tests for other bindings
	it.todo("exposes hyperdrive bindings");
	it.skipIf(isLocal).todo("exposes send email bindings");
	it.skipIf(isLocal).todo("exposes browser bindings");
	it.skipIf(isLocal).todo("exposes Workers AI bindings");
	it.skipIf(isLocal).todo("exposes Vectorize bindings");
	it.skipIf(isLocal).todo("exposes Analytics Engine bindings");
	it.skipIf(isLocal).todo("exposes dispatch namespace bindings");
	it.skipIf(isLocal).todo("exposes mTLS bindings");
});

describe.each(RUNTIMES)("Multi-Worker Bindings: $runtime", ({ runtime }) => {
	const isLocal = runtime === "local";
	const _runtimeFlags = isLocal ? [] : ["--remote"];

	// TODO(soon): we already have tests for service bindings in `dev.test.ts`,
	//  but would be good to get some more for Durable Objects
	it.todo("exposes service bindings to other workers");
	it.todo("exposes Durable Object bindings to other workers");
});
