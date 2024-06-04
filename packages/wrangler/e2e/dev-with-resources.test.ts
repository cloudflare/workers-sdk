import assert from "node:assert";
import events from "node:events";
import getPort from "get-port";
import dedent from "ts-dedent";
import { Agent, fetch } from "undici";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { WebSocket } from "ws";
import { e2eTest } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";
import { killAllWranglerDev } from "./helpers/wrangler";

beforeEach(killAllWranglerDev);
afterEach(killAllWranglerDev);

const RUNTIMES = [
	{ flags: "", runtime: "local" },
	{ flags: "--remote", runtime: "remote" },
	{ flags: "--x-dev-env", runtime: "local" },
	{ flags: "--remote --x-dev-env", runtime: "remote" },
] as const;

// WebAssembly module containing single `func add(i32, i32): i32` export.
// Generated using https://webassembly.github.io/wabt/demo/wat2wasm/.
const WASM_ADD_MODULE = Buffer.from(
	"AGFzbQEAAAABBwFgAn9/AX8DAgEABwcBA2FkZAAACgkBBwAgACABagsACgRuYW1lAgMBAAA=",
	"base64"
);

describe.each(RUNTIMES)("Core: $flags", ({ runtime, flags }) => {
	const isLocal = runtime === "local";

	e2eTest(
		"works with basic modules format worker",
		async ({ seed, run, waitForReady }) => {
			const workerName = generateResourceName();
			await seed({
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
			const worker = run(`wrangler dev ${flags}`);
			const { url } = await waitForReady(worker);
			let res = await fetch(url);

			expect(await res.text()).toBe("modules");

			res = await fetch(new URL("/error", url), {
				headers: { Accept: "text/plain" },
			});
			const text = await res.text();
			if (isLocal) {
				expect(text).toContain("Error: 🙈");
				expect(text).toContain("src/index.ts:7:10");
			}
			await worker.readUntil(/Error: 🙈/);
			await worker.readUntil(/src\/index\.ts:7:10/);
		}
	);

	e2eTest(
		"works with basic service worker",
		async ({ seed, run, waitForReady }) => {
			const workerName = generateResourceName();
			await seed({
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
			const worker = run(`wrangler dev ${flags}`);
			const { url } = await waitForReady(worker);
			let res = await fetch(url);
			expect(await res.text()).toBe("service worker");

			res = await fetch(new URL("/error", url), {
				headers: { Accept: "text/plain" },
			});
			const text = await res.text();
			if (isLocal) {
				expect(text).toContain("Error: 🙈");
				expect(text).toContain("src/index.ts:6:9");
			}
			await worker.readUntil(/Error: 🙈/);
			await worker.readUntil(/src\/index\.ts:6:9/);
		}
	);

	e2eTest.todo("workers with no bundle");
	e2eTest.todo("workers with find additional modules");

	e2eTest(
		"respects compatibility settings",
		async ({ seed, run, waitForReady }) => {
			const workerName = generateResourceName();
			// `global_navigator` enabled on `2022-03-21`: https://developers.cloudflare.com/workers/configuration/compatibility-dates/#global-navigator
			// `http_headers_getsetcookie` enabled on `2023-03-01`: https://developers.cloudflare.com/workers/configuration/compatibility-dates/#headers-supports-getsetcookie
			// `2022-03-22` should enable `global_navigator` but disable `http_headers_getsetcookie`
			// `nodejs_compat` has no default-on-date
			await seed({
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
			const worker = run(`wrangler dev ${flags}`);
			const { url } = await waitForReady(worker);
			const res = await fetch(url);
			expect(await res.json()).toEqual({
				userAgent: "Cloudflare-Workers",
				cookies: "😈", // No cookies for you!
				encoded: "8J+nog==",
			});
		}
	);

	e2eTest(
		"starts inspector and allows debugging",
		async ({ seed, run, waitForReady }) => {
			const inspectorPort = await getPort();
			const workerName = generateResourceName();
			await seed({
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
			const worker = run(
				`wrangler dev ${flags} --inspector-port=${inspectorPort}`
			);
			await waitForReady(worker);
			const inspectorUrl = new URL(`ws://127.0.0.1:${inspectorPort}`);
			const ws = new WebSocket(inspectorUrl);
			await events.once(ws, "open");
			ws.close();
			// TODO(soon): once we have inspector proxy worker, write basic tests here,
			//  messages currently too non-deterministic to do this reliably
		}
	);

	e2eTest("starts https server", async ({ seed, run, waitForReady }) => {
		const workerName = generateResourceName();
		await seed({
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
		const worker = run(`wrangler dev ${flags} --local-protocol=https`);
		const { url } = await waitForReady(worker);
		const parsedURL = new URL(url);
		expect(parsedURL.protocol).toBe("https:");
		const res = await fetch(url, {
			dispatcher: new Agent({ connect: { rejectUnauthorized: false } }),
		});
		expect(await res.text()).toBe("🔐");
	});

	e2eTest.skipIf(!isLocal)(
		"uses configured upstream inside worker",
		async ({ seed, run, waitForReady }) => {
			const workerName = generateResourceName();
			await seed({
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
			const worker = run(`wrangler dev ${flags} --local-upstream=example.com`);
			const { url } = await waitForReady(worker);
			const res = await fetch(url);
			expect(await res.text()).toBe("http://example.com/");
		}
	);
});

describe.each(RUNTIMES)("Bindings: $flags", ({ runtime, flags }) => {
	const isLocal = runtime === "local";
	const resourceFlags = isLocal ? "--local" : "";
	const d1ResourceFlags = isLocal ? "" : "--remote";

	e2eTest(
		"exposes basic bindings in service workers",
		async ({ seed, run, waitForReady }) => {
			const workerName = generateResourceName();
			await seed({
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
			const worker = run(`wrangler dev ${flags}`);
			const { url } = await waitForReady(worker);
			const res = await fetch(url);
			expect(await res.json()).toEqual({
				TEXT: "📄",
				OBJECT: { charts: "📊" },
				TEXT_BLOB: "👋",
				DATA_BLOB: "🌊",
			});
		}
	);

	e2eTest(
		"exposes WebAssembly module bindings in service workers",
		async ({ seed, run, waitForReady }) => {
			const workerName = generateResourceName();
			await seed({
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
			const worker = run(`wrangler dev ${flags}`);
			const { url } = await waitForReady(worker);
			const res = await fetch(url);
			expect(await res.text()).toBe("3");
		}
	);

	e2eTest(
		"exposes KV namespace bindings",
		async ({ kv, run, seed, waitForReady }) => {
			const ns = await kv(isLocal);
			await run(
				`wrangler kv:key put ${resourceFlags} --namespace-id=${ns} existing-key existing-value`
			);

			const workerName = generateResourceName();
			await seed({
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
			const worker = run(`wrangler dev ${flags}`);
			const { url } = await waitForReady(worker);
			const res = await fetch(url);
			expect(await res.text()).toBe("existing-value");

			const result = await run(
				`wrangler kv:key get ${resourceFlags} --namespace-id=${ns} new-key`
			);
			expect(result).toBe("new-value");
		}
	);

	e2eTest(
		"supports Workers Sites bindings",
		async ({ seed, run, waitForReady }) => {
			const workerName = generateResourceName();
			const kvAssetHandler = require.resolve("@cloudflare/kv-asset-handler");
			await seed({
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

			const worker = run(`wrangler dev ${flags}`);
			const { url } = await waitForReady(worker);
			const res = await fetch(url);
			expect(await res.text()).toBe("<h1>👋</h1>");

			// Try to clean up created remote Workers Sites namespace
			if (!isLocal) {
				const listResult = await run(`wrangler kv:namespace list`);
				const list = JSON.parse(
					// Ignore extra debug output
					listResult.substring(
						listResult.indexOf("["),
						listResult.lastIndexOf("]") + 1
					)
				);
				assert(Array.isArray(list));
				const ns = list.find(({ title }) => title.includes(workerName));
				if (ns === undefined) {
					console.warn("Couldn't find Workers Sites namespace to delete");
				} else {
					await run(`wrangler kv:namespace delete --namespace-id ${ns.id}`);
				}
			}
		}
	);

	e2eTest(
		"exposes R2 bucket bindings",
		async ({ seed, run, r2, waitForReady }) => {
			await seed({ "test.txt": "existing-value" });

			const name = await r2(isLocal);
			await run(
				`wrangler r2 object put ${resourceFlags} ${name}/existing-key --file test.txt`
			);

			const workerName = generateResourceName();
			await seed({
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
			const worker = run(`wrangler dev ${flags}`);
			const { url } = await waitForReady(worker);
			const res = await fetch(url);
			expect(await res.text()).toBe("existing-value");

			const result = await run(
				`wrangler r2 object get ${resourceFlags} ${name}/new-key --pipe`
			);
			// TODO(soon): make this `toBe()` once we remove `Logs were written` message
			expect(result).toContain("new-value");

			await run(
				`wrangler r2 object delete ${resourceFlags} ${name}/existing-key`
			);
			await run(`wrangler r2 object delete ${resourceFlags} ${name}/new-key`);
		}
	);

	e2eTest(
		"exposes D1 database bindings",
		async ({ seed, run, d1, waitForReady }) => {
			const { id, name } = await d1(isLocal);
			const workerName = generateResourceName();
			await seed({
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

			// D1 defaults to `--local`, so we deliberately use `flags`, not `resourceFlags`
			await run(`wrangler d1 execute ${d1ResourceFlags} DB --file schema.sql`);

			const worker = run(`wrangler dev ${flags}`);
			const { url } = await waitForReady(worker);
			const res = await fetch(url);
			expect(await res.json()).toEqual([{ key: "key1", value: "value1" }]);

			const result = await run(
				`wrangler d1 execute ${d1ResourceFlags} DB --command "SELECT * FROM entries WHERE key = 'key2'"`
			);
			expect(result).toContain("value2");
		}
	);

	e2eTest.skipIf(!isLocal)(
		"exposes queue producer/consumer bindings",
		async ({ seed, run, waitForReady }) => {
			const queueName = generateResourceName("queue");
			const workerName = generateResourceName();
			await seed({
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
			const worker = run(`wrangler dev ${flags}`);
			const { url } = await waitForReady(worker);
			await fetch(url);
			await worker.readUntil(/✉️/);
		}
	);

	// TODO(soon): implement E2E tests for other bindings
	e2eTest.todo("exposes hyperdrive bindings");
	e2eTest.skipIf(isLocal).todo("exposes send email bindings");
	e2eTest.skipIf(isLocal).todo("exposes browser bindings");
	e2eTest.skipIf(isLocal).todo("exposes Workers AI bindings");
	e2eTest.skipIf(isLocal).todo("exposes Vectorize bindings");
	e2eTest.skipIf(isLocal).todo("exposes Analytics Engine bindings");
	e2eTest.skipIf(isLocal).todo("exposes dispatch namespace bindings");
	e2eTest.skipIf(isLocal).todo("exposes mTLS bindings");
});

describe.each(RUNTIMES)("Multi-Worker Bindings: $runtime", ({ runtime }) => {
	const isLocal = runtime === "local";
	const _flags = isLocal ? [] : ["--remote"];

	// TODO(soon): we already have tests for service bindings in `dev.test.ts`,
	//  but would be good to get some more for Durable Objects
	e2eTest.todo("exposes service bindings to other workers");
	e2eTest.todo("exposes Durable Object bindings to other workers");
});
