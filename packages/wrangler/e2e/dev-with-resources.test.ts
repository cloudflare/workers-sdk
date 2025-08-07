import assert from "node:assert";
import events from "node:events";
import getPort from "get-port";
import dedent from "ts-dedent";
import { Agent, fetch } from "undici";
import { beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";

const port = await getPort();
const inspectorPort = await getPort();

const RUNTIMES = [
	{ flags: "", runtime: "local" },
	...(CLOUDFLARE_ACCOUNT_ID ? [{ flags: "--remote", runtime: "remote" }] : []),
];

// WebAssembly module containing single `func add(i32, i32): i32` export.
// Generated using https://webassembly.github.io/wabt/demo/wat2wasm/.
const WASM_ADD_MODULE = Buffer.from(
	"AGFzbQEAAAABBwFgAn9/AX8DAgEABwcBA2FkZAAACgkBBwAgACABagsACgRuYW1lAgMBAAA=",
	"base64"
);

/**
 * We use the same workerName for all of the tests in this suite in hopes of reducing flakes.
 * When creating a new worker, a <workerName>.devprod-testing7928.workers.dev subdomain is created.
 * The platform API locks a database table for the zone (devprod-testing7928.workers.dev) while doing this.
 * Creating many workers in the same account/zone in quick succession can run up against the lock.
 * This test suite runs sequentially so does not cause lock issues for itself, but we run into lock issues
 * when multiple PRs have jobs running at the same time (or the same PR has the tests run across multiple OSes).
 */
const workerName = generateResourceName();

describe.sequential.each(RUNTIMES)("Core: $flags", ({ runtime, flags }) => {
	const isLocal = runtime === "local";

	let helper: WranglerE2ETestHelper;
	beforeEach(() => {
		helper = new WranglerE2ETestHelper();
	});

	it("works with basic modules format worker", async () => {
		await helper.seed({
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
							throw new Error("monkey");
						} else {
							return new Response(null, { status: 404 });
						}
					}
				}
			`,
		});
		const worker = helper.runLongLived(
			`wrangler dev ${flags} --port ${port} --inspector-port ${inspectorPort}`
		);
		const { url } = await worker.waitForReady();
		let res = await fetch(url);

		expect(await res.text()).toBe("modules");

		res = await fetch(new URL("/error", url), {
			headers: { Accept: "text/plain" },
		});
		const text = await res.text();
		if (isLocal) {
			expect(text).toContain("Error: monkey");
			expect(text).toContain("src/index.ts:7:10");
		}
		await worker.readUntil(/Error: monkey/, 30_000);
		await worker.readUntil(/src\/index\.ts:7:10/, 30_000);
	});

	it("works with basic service worker", async () => {
		await helper.seed({
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
						throw new Error("monkey");
					} else {
						event.respondWith(new Response(null, { status: 404 }));
					}
				});
			`,
		});
		const worker = helper.runLongLived(
			`wrangler dev ${flags} --port ${port} --inspector-port ${inspectorPort}`
		);
		const { url } = await worker.waitForReady();
		let res = await fetch(url);
		expect(await res.text()).toBe("service worker");

		res = await fetch(new URL("/error", url), {
			headers: { Accept: "text/plain" },
		});
		const text = await res.text();
		if (isLocal) {
			expect(text).toContain("Error: monkey");
			expect(text).toContain("src/index.ts:6:9");
		}
		await worker.readUntil(/Error: monkey/, 30_000);
		await worker.readUntil(/src\/index\.ts:6:9/, 30_000);
	});

	it.todo("workers with no bundle");
	it.todo("workers with find additional modules");

	it("respects compatibility settings", async () => {
		// `global_navigator` enabled on `2022-03-21`: https://developers.cloudflare.com/workers/configuration/compatibility-dates/#global-navigator
		// `http_headers_getsetcookie` enabled on `2023-03-01`: https://developers.cloudflare.com/workers/configuration/compatibility-dates/#headers-supports-getsetcookie
		// `2022-03-22` should enable `global_navigator` but disable `http_headers_getsetcookie`
		// `nodejs_compat` has no default-on-date
		await helper.seed({
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
		const worker = helper.runLongLived(
			`wrangler dev ${flags} --port ${port} --inspector-port ${inspectorPort}`
		);
		const { url } = await worker.waitForReady();
		const res = await fetch(url);
		expect(await res.json()).toEqual({
			userAgent: "Cloudflare-Workers",
			cookies: "😈", // No cookies for you!
			encoded: "8J+nog==",
		});
	});

	it("starts inspector and allows debugging", async () => {
		await helper.seed({
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
		const worker = helper.runLongLived(
			`wrangler dev ${flags} --port ${port} --inspector-port ${inspectorPort}`
		);
		await worker.waitForReady();
		const inspectorUrl = new URL(`ws://127.0.0.1:${inspectorPort}`);
		const ws = new WebSocket(inspectorUrl);
		await events.once(ws, "open");
		ws.close();
		// TODO(soon): once we have inspector proxy worker, write basic tests here,
		//  messages currently too non-deterministic to do this reliably
	});

	it("starts https server", async () => {
		await helper.seed({
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
		const worker = helper.runLongLived(
			`wrangler dev ${flags} --port ${port} --inspector-port ${inspectorPort} --local-protocol=https`
		);
		const { url } = await worker.waitForReady();
		const parsedURL = new URL(url);
		expect(parsedURL.protocol).toBe("https:");
		const res = await fetch(url, {
			dispatcher: new Agent({ connect: { rejectUnauthorized: false } }),
		});
		expect(await res.text()).toBe("🔐");
	});

	it.skipIf(!isLocal)("uses configured upstream inside worker", async () => {
		await helper.seed({
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
		// TODO(soon): explore using `--host` for remote mode in this test
		const worker = helper.runLongLived(
			`wrangler dev ${flags} --port ${port} --inspector-port ${inspectorPort} --local-upstream=example.com`
		);
		const { url } = await worker.waitForReady();
		const res = await fetch(url);
		expect(await res.text()).toBe("http://example.com/");
	});
});

describe.sequential.each(RUNTIMES)("Bindings: $flags", ({ runtime, flags }) => {
	const isLocal = runtime === "local";
	const resourceFlags = isLocal ? "" : "--remote";

	let helper: WranglerE2ETestHelper;
	beforeEach(() => {
		helper = new WranglerE2ETestHelper();
	});

	it("exposes basic bindings in service workers", async () => {
		await helper.seed({
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
		const worker = helper.runLongLived(
			`wrangler dev ${flags} --port ${port} --inspector-port ${inspectorPort}`
		);
		const { url } = await worker.waitForReady();
		const res = await fetch(url);
		expect(await res.json()).toEqual({
			TEXT: "📄",
			OBJECT: { charts: "📊" },
			TEXT_BLOB: "👋",
			DATA_BLOB: "🌊",
		});
	});

	it("exposes WebAssembly module bindings in service workers", async () => {
		await helper.seed({
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
		const worker = helper.runLongLived(
			`wrangler dev ${flags} --port ${port} --inspector-port ${inspectorPort}`
		);
		const { url } = await worker.waitForReady();
		const res = await fetch(url);
		expect(await res.text()).toBe("3");
	});

	it("exposes KV namespace bindings", async () => {
		const ns = await helper.kv(isLocal);
		await helper.run(
			`wrangler kv key put ${resourceFlags} --namespace-id=${ns} existing-key existing-value`
		);

		await helper.seed({
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
						console.log(await env.NAMESPACE.list())
						const value = await env.NAMESPACE.get("existing-key");
						await env.NAMESPACE.put("new-key", "new-value");
						return new Response(value);
					}
				}
			`,
		});
		const worker = helper.runLongLived(
			`wrangler dev ${flags} --port ${port} --inspector-port ${inspectorPort}`
		);
		const { url } = await worker.waitForReady();
		const res = await fetch(url);
		expect(await res.text()).toBe("existing-value");

		const result = await helper.run(
			`wrangler kv key get ${resourceFlags} --namespace-id=${ns} new-key`
		);
		expect(result.stdout).toBe("new-value");
	});

	it("exposes Secrets Store bindings", async () => {
		// if remote, secrets store and secret will already be created
		const storeId = "37009502100840c0a9800b4990ed0449";
		const secret_name = "well-known-secret";

		// but we need to create the secret each time when running locally
		if (isLocal) {
			await helper.run(
				`wrangler secrets-store secret create ${storeId} ${resourceFlags} --name ${secret_name} --value my-secret-value --scopes workers`
			);
		}

		await helper.seed({
			"wrangler.toml": dedent`
				name = "${workerName}"
				main = "src/index.ts"
				compatibility_date = "2025-01-01"
				# Regression test for https://github.com/cloudflare/workers-sdk/issues/9006
				kv_namespaces = [
					${isLocal ? `{ binding = "KV", id = "LOCAL_ONLY" }` : ""}
				]
				secrets_store_secrets = [
					{ binding = "SECRET", store_id = "${storeId}", secret_name = "${secret_name}" }
				]
			`,
			"src/index.ts": dedent`
				export default {
					async fetch(request, env, ctx) {
						return new Response(await env.SECRET.get());
					}
				}
			`,
		});
		const worker = helper.runLongLived(
			`wrangler dev ${flags} --port ${port} --inspector-port ${inspectorPort}`
		);
		const { url } = await worker.waitForReady();
		const res = await fetch(url, {
			headers: { "MF-Disable-Pretty-Error": "true" },
		});
		expect(await res.text()).toBe("my-secret-value");
	});

	it.skipIf(!isLocal)("exposes Hello World bindings", async () => {
		await helper.seed({
			"wrangler.toml": dedent`
				name = "${workerName}"
				main = "src/index.ts"
				compatibility_date = "2025-01-01"
				unsafe_hello_world = [
					{ binding = "BINDING" }
				]
			`,
			"src/index.ts": dedent`
				export default {
					async fetch(request, env, ctx) {
						 if (request.method === "POST") {
							await env.BINDING.set(await request.text());
						}
						const result = await env.BINDING.get();
						if (!result.value) {
							return new Response('Not found', { status: 404 });
						}
						return Response.json(result);
					}
				}
			`,
		});
		const worker = helper.runLongLived(
			`wrangler dev ${flags} --port ${port} --inspector-port ${inspectorPort}`
		);
		const { url } = await worker.waitForReady();
		const res1 = await fetch(url, {
			headers: { "MF-Disable-Pretty-Error": "true" },
		});
		expect(await res1.text()).toBe("Not found");
		expect(res1.status).toBe(404);

		const res2 = await fetch(url, {
			method: "POST",
			body: "hello world",
			headers: { "MF-Disable-Pretty-Error": "true" },
		});
		expect(await res2.json()).toEqual({ value: "hello world" });
		expect(res2.status).toBe(200);

		const res3 = await fetch(url, {
			headers: { "MF-Disable-Pretty-Error": "true" },
		});
		expect(await res3.json()).toEqual({ value: "hello world" });
		expect(res3.status).toBe(200);

		const res4 = await fetch(url, {
			method: "POST",
			body: "",
			headers: { "MF-Disable-Pretty-Error": "true" },
		});
		expect(await res4.text()).toBe("Not found");
		expect(res4.status).toBe(404);
	});

	it("supports Workers Sites bindings", async ({ onTestFinished }) => {
		if (!isLocal) {
			onTestFinished(async () => {
				// Try to clean up created remote Workers Sites namespace
				const listResult = await helper.run(`wrangler kv namespace list`);
				const list = JSON.parse(
					// Ignore extra debug output
					listResult.stdout.substring(
						listResult.stdout.indexOf("["),
						listResult.stdout.lastIndexOf("]") + 1
					)
				);
				assert(Array.isArray(list));
				const ns = list.find(({ title }) => title.includes(workerName));
				if (ns === undefined) {
					console.warn("Couldn't find Workers Sites namespace to delete");
				} else {
					await helper.run(
						`wrangler kv namespace delete --namespace-id ${ns.id}`
					);
				}
			});
		}

		const kvAssetHandler = require.resolve("@cloudflare/kv-asset-handler");
		await helper.seed({
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

		const worker = helper.runLongLived(
			`wrangler dev ${flags} --port ${port} --inspector-port ${inspectorPort}`
		);
		const { url } = await worker.waitForReady();
		const res = await fetch(url);
		expect(await res.text()).toBe("<h1>👋</h1>");
	});

	it("exposes R2 bucket bindings", async () => {
		await helper.seed({ "test.txt": "existing-value" });

		const name = await helper.r2(isLocal);
		await helper.run(
			`wrangler r2 object put ${resourceFlags} ${name}/existing-key --file test.txt`
		);

		await helper.seed({
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
		const worker = helper.runLongLived(
			`wrangler dev ${flags} --port ${port} --inspector-port ${inspectorPort}`
		);
		const { url } = await worker.waitForReady();
		const res = await fetch(url);
		expect(await res.text()).toBe("existing-value");

		const result = await helper.run(
			`wrangler r2 object get ${resourceFlags} ${name}/new-key --pipe`
		);
		// TODO(soon): make this `toBe()` once we remove `Logs were written` message
		expect(result.stdout).toContain("new-value");

		await helper.run(
			`wrangler r2 object delete ${resourceFlags} ${name}/existing-key`
		);
		await helper.run(
			`wrangler r2 object delete ${resourceFlags} ${name}/new-key`
		);
	});

	it("exposes D1 database bindings", async () => {
		const { id, name } = await helper.d1(isLocal);

		await helper.seed({
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

		const result = await helper.run(
			`wrangler d1 execute ${resourceFlags} DB --file schema.sql`
		);
		// D1 defaults to `--local`, so we deliberately use `flags`, not `resourceFlags`
		const worker = helper.runLongLived(
			`wrangler dev ${flags} --port ${port} --inspector-port ${inspectorPort}`
		);
		const { url } = await worker.waitForReady();
		const res = await fetch(url);
		expect(await res.json()).toEqual([{ key: "key1", value: "value1" }]);
		if (isLocal) {
			expect(result.stdout).toContain("🚣 2 commands executed successfully.");
		}

		const result2 = await helper.run(
			`wrangler d1 execute ${resourceFlags} DB --command "SELECT * FROM entries WHERE key = 'key2'"`
		);
		expect(result2.stdout).toContain("value2");
		if (isLocal) {
			expect(result2.stdout).toContain("🚣 1 command executed successfully.");
		}
	});

	// Refer to https://github.com/cloudflare/workers-sdk/pull/8492 for full context on why this test does different things to the others.
	// In particular, it uses a shared resource across test runs
	it.skipIf(!CLOUDFLARE_ACCOUNT_ID)("exposes Vectorize bindings", async () => {
		const name = await helper.vectorize(
			32,
			"euclidean",
			"well-known-vectorize"
		);

		await helper.seed({
			"wrangler.toml": dedent`
				name = "${workerName}"
				main = "src/index.ts"
				compatibility_date = "2024-08-01"
				[[vectorize]]
				binding = "VECTORIZE"
				index_name = "${name}"
				`,
			"src/index.ts": dedent/*javascript*/ `
				export interface Env {
					VECTORIZE: Vectorize;
				}

				export default {
					async fetch(request: Request, env: Env, ctx: any) {
						const url = new URL(request.url)
						if(url.pathname === "/insert") {
							await env.VECTORIZE.insert([{"id":"a44706aa-a366-48bc-8cc1-3feffd87d548","values":[0.2321,0.8121,0.6315,0.6151,0.4121,0.1512,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"metadata":{"text":"Peter Piper picked a peck of pickled peppers"}}]);
							await env.VECTORIZE.insert([{"id":"b0daca4a-ffd8-4865-926b-e24800af2a2d","values":[0.2331,1.0125,0.6131,0.9421,0.9661,0.8121,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"metadata":{"text":"She sells seashells by the sea"}}]);
							await env.VECTORIZE.upsert([{"id":"b0daca4a-ffd8-4865-926b-e24800af2a2d","values":[0.2331,1.0125,0.6131,0.9421,0.9661,0.8121,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"metadata":{"text":"She sells seashells by the seashore"}}]);
							return new Response("inserted")
						}
						if(url.pathname === "/query") {
							let response = "";
							response += JSON.stringify(await env.VECTORIZE.getByIds(["a44706aa-a366-48bc-8cc1-3feffd87d548"]));

							const queryVector: Array<number> = [
								0.13, 0.25, 0.44, 0.53, 0.62, 0.41, 0.59, 0.68, 0.29, 0.82, 0.37, 0.5,
								0.74, 0.46, 0.57, 0.64, 0.28, 0.61, 0.73, 0.35, 0.78, 0.58, 0.42, 0.32,
								0.77, 0.65, 0.49, 0.54, 0.31, 0.29, 0.71, 0.57,
							]; // vector of dimension 32
							const matches = await env.VECTORIZE.query(queryVector, {
								topK: 3,
								returnValues: true,
								returnMetadata: "all",
							});

							return new Response(response);
						}
					}
				}
				`,
		});

		const worker = helper.runLongLived(
			`wrangler dev ${flags} --port ${port} --inspector-port ${inspectorPort} --experimental-vectorize-bind-to-prod`
		);
		const { url } = await worker.waitForReady();
		await fetch(`${url}/insert`);
		const res = await fetch(`${url}/query`);

		await expect(res.text()).resolves.toBe(
			`[{"id":"a44706aa-a366-48bc-8cc1-3feffd87d548","namespace":null,"metadata":{"text":"Peter Piper picked a peck of pickled peppers"},"values":[0.2321,0.8121,0.6315,0.6151,0.4121,0.1512,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}]`
		);
	});

	it.skipIf(isLocal)("exposes Hyperdrive bindings", async () => {
		const { id } = await helper.hyperdrive(isLocal);

		await helper.seed({
			"wrangler.toml": dedent`
					name = "${workerName}"
					main = "src/index.ts"
					compatibility_date = "2023-10-25"

					[[hyperdrive]]
					binding = "HYPERDRIVE"
					id = "${id}"
			`,
			"src/index.ts": dedent`
					export default {
						async fetch(request, env) {
							if (request.url.includes("connect")) {
								const conn = env.HYPERDRIVE.connect();
							}
							return new Response(env.HYPERDRIVE?.connectionString ?? "no")
						}
					}`,
		});

		const worker = helper.runLongLived(`wrangler dev ${flags}`);
		const { url } = await worker.waitForReady();
		await fetch(`${url}/connect`);
	});

	it("exposes Pipelines bindings", async () => {
		await helper.seed({
			"wrangler.toml": dedent`
				name = "${workerName}"
				main = "src/index.ts"
				compatibility_date = "2024-10-20"

				[[pipelines]]
				binding = "PIPELINE"
				pipeline = "preserve-e2e-pipelines"
			`,
			"src/index.ts": dedent`
				export default {
					async fetch(request, env, ctx) {
						let log = {
							url: request.url,
							method: request.method,
							headers: Object.fromEntries(request.headers),
						};
						await env.PIPELINE.send([log]);
						return new Response("Data sent to env.PIPELINE");
					}
				}
			`,
		});

		const worker = helper.runLongLived(
			`wrangler dev ${flags} --port ${port} --inspector-port ${inspectorPort}`
		);
		const { url } = await worker.waitForReady();
		const res = await fetch(url);

		await expect(res.text()).resolves.toBe("Data sent to env.PIPELINE");
	});

	it.skipIf(!isLocal)("exposes queue producer/consumer bindings", async () => {
		const queueName = generateResourceName("queue");

		await helper.seed({
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
		const worker = helper.runLongLived(
			`wrangler dev ${flags} --port ${port} --inspector-port ${inspectorPort}`
		);
		const { url } = await worker.waitForReady();
		await fetch(url);
		await worker.readUntil(/✉️/);
	});

	// TODO: enable for remove dev once realish preview supports it
	// TODO: enable for local dev once implemented
	it.skip("exposes Workflow bindings", async () => {
		await helper.seed({
			"wrangler.toml": dedent`
                name = "my-workflow-demo"
                main = "src/index.ts"
                compatibility_date = "2024-10-11"

                [[workflows]]
                binding = "WORKFLOW"
                name = "my-workflow"
                class_name = "Demo"
            `,
			"src/index.ts": dedent`
                import { WorkflowEntrypoint } from "cloudflare:workers";

                export default {
                    async fetch(request, env, ctx) {
                        if (env.WORKFLOW === undefined) {
                            return new Response("env.WORKFLOW is undefined");
                        }

                        return new Response("env.WORKFLOW is available");
                    }
                }

                export class Demo extends WorkflowEntrypoint {
                    run() {
                        // blank
                    }
                }
            `,
		});
		const worker = helper.runLongLived(
			`wrangler dev ${flags} --port ${port} --inspector-port ${inspectorPort}`
		);
		const { url } = await worker.waitForReady();
		const res = await fetch(url);

		await expect(res.text()).resolves.toBe("env.WORKFLOW is available");
	});

	describe.sequential.each([
		{
			imagesMode: "local",
			extraFlags: "--experimental-images-local-mode",
		},
		...(CLOUDFLARE_ACCOUNT_ID
			? [{ imagesMode: "remote", extraFlags: "" }]
			: []),
	])("Images Binding Mode: $imagesMode", async ({ extraFlags }) => {
		it("exposes Images bindings", async () => {
			await helper.seed({
				"wrangler.toml": dedent`
					name = "my-images-demo"
					main = "src/index.ts"
					compatibility_date = "2024-12-27"

					[images]
					binding = "IMAGES"
				`,
				"src/index.ts": dedent`
					export default {
						async fetch(request, env, ctx) {
							if (env.IMAGES === undefined) {
								return new Response("env.IMAGES is undefined");
							}

							return new Response("env.IMAGES is available");
						}
					}
				`,
			});
			const worker = helper.runLongLived(`wrangler dev ${flags} ${extraFlags}`);
			const { url } = await worker.waitForReady();
			const res = await fetch(url);

			await expect(res.text()).resolves.toBe("env.IMAGES is available");
		});
	});

	// TODO(soon): implement E2E tests for other bindings
	it.skipIf(isLocal).todo("exposes send email bindings");
	it.skipIf(isLocal).todo("exposes browser bindings");
	it.skipIf(isLocal).todo("exposes Workers AI bindings");
	it.skipIf(isLocal).todo("exposes Analytics Engine bindings");
	it.skipIf(isLocal).todo("exposes dispatch namespace bindings");
	it.skipIf(isLocal).todo("exposes mTLS bindings");
});

describe.each(RUNTIMES)("Multi-Worker Bindings: $runtime", ({ runtime }) => {
	const isLocal = runtime === "local";
	const _flags = isLocal ? [] : ["--remote"];

	// TODO(soon): we already have tests for service bindings in `dev.test.ts`,
	//  but would be good to get some more for Durable Objects
	it.todo("exposes service bindings to other workers");
	it.todo("exposes Durable Object bindings to other workers");
});
