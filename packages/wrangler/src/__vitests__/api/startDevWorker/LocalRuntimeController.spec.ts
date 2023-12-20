// noinspection DuplicatedCode

import assert from "node:assert";
import events from "node:events";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import util from "node:util";
import { DeferredPromise, Response, fetch } from "miniflare";
import { describe, it, expect } from "vitest";
import { WebSocket } from "ws";
import { LocalRuntimeController } from "../../../api/startDevWorker/LocalRuntimeController";
import { teardown, useTmp } from "../../helpers/teardown";
import { unusable } from "../../helpers/unusable";
import type {
	Bundle,
	ReloadCompleteEvent,
	StartDevWorkerOptions,
	UrlOriginAndPathnameParts,
	UrlOriginParts,
} from "../../../api";

// WebAssembly module containing single `func add(i32, i32): i32` export.
// Generated using https://webassembly.github.io/wabt/demo/wat2wasm/.
const WASM_ADD_MODULE = Buffer.from(
	"AGFzbQEAAAABBwFgAn9/AX8DAgEABwcBA2FkZAAACgkBBwAgACABagsACgRuYW1lAgMBAAA=",
	"base64"
);

async function waitForReloadComplete(
	controller: LocalRuntimeController
): Promise<ReloadCompleteEvent> {
	const [event] = await events.once(controller, "reloadComplete");
	return event;
}

function joinUrlParts(parts: UrlOriginParts | UrlOriginAndPathnameParts): URL {
	const pathname = "pathname" in parts ? parts.pathname : "";
	const spec = `${parts.protocol}//${parts.hostname}:${parts.port}${pathname}`;
	return new URL(spec);
}

function singleModuleBundle(
	strings: TemplateStringsArray,
	...args: unknown[]
): Bundle {
	return {
		type: "modules",
		modules: [
			{
				type: "ESModule",
				name: "index.mjs",
				path: "/virtual/index.mjs",
				contents: String.raw(strings, ...args),
			},
		],
	};
}

describe("Core", () => {
	it("should start Miniflare with module worker", async () => {
		const controller = new LocalRuntimeController();
		teardown(() => controller.teardown());

		const config: StartDevWorkerOptions = {
			name: "worker",
			script: unusable(),
			compatibilityFlags: ["nodejs_compat"],
			compatibilityDate: "2023-10-01",
		};
		const bundle: Bundle = {
			type: "modules",
			modules: [
				{
					type: "ESModule",
					name: "index.mjs",
					path: "/virtual/esm/index.mjs",
					contents: `
					import add from "./add.cjs";
					import base64 from "./base64.cjs";
					import wave1 from "./data/wave.txt";
					import wave2 from "./data/wave.bin";
					export default {
						fetch(request, env, ctx) {
							const { pathname } = new URL(request.url);
							if (pathname === "/") {
								const wave2Text = new TextDecoder().decode(wave2);
								return Response.json({
									message: base64.decode(base64.encode(wave1 + wave2Text)),
									sum: add.add(1, 2),
								});
							} else if (pathname === "/throw-commonjs") {
								try { add.throw(); } catch (e) { return new Response(e.stack); }
							} else if (pathname === "/throw-nodejs-compat-module") {
								try { base64.throw(); } catch (e) { return new Response(e.stack); }
							} else {
								return new Response(null, { status: 404 });
							}
						}
					}`,
				},
				{
					type: "CommonJS",
					name: "add.cjs",
					path: "/virtual/cjs/add.cjs",
					contents: `
					const addModule = require("./add.wasm");
					const addInstance = new WebAssembly.Instance(addModule);
					module.exports = {
						add: addInstance.exports.add,
						throw() {
							throw new Error("Oops!");
						}
					}
					`,
				},
				{
					type: "NodeJsCompatModule",
					name: "base64.cjs",
					path: "/virtual/node/base64.cjs",
					contents: `module.exports = {
						encode(value) {
							return Buffer.from(value).toString("base64");
						},
						decode(value) {
							return Buffer.from(value, "base64").toString();
						},
						throw() {
							throw new Error("Oops!");
						}
					}`,
				},
				{ type: "Text", name: "data/wave.txt", contents: "👋" },
				{ type: "Data", name: "data/wave.bin", contents: "🌊" },
				{ type: "CompiledWasm", name: "add.wasm", contents: WASM_ADD_MODULE },
			],
		};
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		const event = await waitForReloadComplete(controller);
		const url = joinUrlParts(event.proxyData.userWorkerUrl);

		// Check all module types
		let res = await fetch(url);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ message: "👋🌊", sum: 3 });

		// Check stack traces from ESModule and CommonJS modules include file path
		res = await fetch(new URL("/throw-commonjs", url));
		expect(res.status).toBe(200);
		expect(await res.text()).toMatchInlineSnapshot(`
			"Error: Oops!
			    at Object.throw (file:///virtual/cjs/add.cjs:7:14)
			    at Object.fetch (file:///virtual/esm/index.mjs:16:24)"
		`);

		// Check stack traces from NodeJsCompatModule modules include file path
		res = await fetch(new URL("/throw-nodejs-compat-module", url));
		expect(res.status).toBe(200);
		expect(await res.text()).toMatchInlineSnapshot(`
			"Error: Oops!
			    at Object.throw (file:///virtual/node/base64.cjs:9:14)
			    at Object.fetch (file:///virtual/esm/index.mjs:18:27)"
		`);
	});
	it("should start Miniflare with service worker", async () => {
		const controller = new LocalRuntimeController();
		teardown(() => controller.teardown());

		const config: StartDevWorkerOptions = {
			name: "worker",
			script: unusable(),
		};
		const bundle: Bundle = {
			type: "service-worker",
			serviceWorker: {
				path: "/virtual/index.js",
				contents: `addEventListener("fetch", (event) => {
					const { pathname } = new URL(event.request.url);
					if (pathname === "/") {
						const addInstance = new WebAssembly.Instance(add_wasm);
						const res = Response.json({
							one: data_one_txt,
							two: new TextDecoder().decode(data_two_bin),
							three: addInstance.exports.add(1, 2),
						});
						event.respondWith(res)
					} else if (pathname === "/throw") {
						try { throw new Error("Oops!"); } catch (e) { event.respondWith(new Response(e.stack)); }
					} else {
						event.respondWith(new Response(null, { status: 404 }));
					}
				});`,
			},
			modules: [
				{ type: "Text", name: "data/one.txt", contents: "one" },
				{ type: "Data", name: "data/two.bin", contents: "two" },
				{ type: "CompiledWasm", name: "add.wasm", contents: WASM_ADD_MODULE },
			],
		};
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		const event = await waitForReloadComplete(controller);
		const url = joinUrlParts(event.proxyData.userWorkerUrl);

		// Check additional modules added to global scope
		let res = await fetch(url);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ one: "one", two: "two", three: 3 });

		// Check stack traces include file path
		res = await fetch(new URL("/throw", url));
		expect(res.status).toBe(200);
		expect(await res.text()).toMatchInlineSnapshot(`
			"Error: Oops!
			    at file:///virtual/index.js:12:19"
		`);
	});
	it("should update the running Miniflare instance", async () => {
		const controller = new LocalRuntimeController();
		teardown(() => controller.teardown());

		function update(version: number) {
			const config: StartDevWorkerOptions = {
				name: "worker",
				script: unusable(),
				bindings: {
					VERSION: { type: "var", value: version },
				},
			};
			const bundle = singleModuleBundle`export default {
				fetch(request, env, ctx) {
					return Response.json({ binding: env.VERSION, bundle: ${version} });
				}
			}`;
			controller.onBundleStart({ type: "bundleStart", config });
			controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		}

		// Start worker
		update(1);
		let event = await waitForReloadComplete(controller);
		let res = await fetch(joinUrlParts(event.proxyData.userWorkerUrl));
		expect(await res.json()).toEqual({ binding: 1, bundle: 1 });

		// Update worker and check config/bundle updated
		update(2);
		event = await waitForReloadComplete(controller);
		res = await fetch(joinUrlParts(event.proxyData.userWorkerUrl));
		expect(await res.json()).toEqual({ binding: 2, bundle: 2 });

		// Update worker multiple times and check only latest config/bundle used
		const eventPromise = waitForReloadComplete(controller);
		update(3);
		update(4);
		update(5);
		event = await eventPromise;
		res = await fetch(joinUrlParts(event.proxyData.userWorkerUrl));
		expect(await res.json()).toEqual({ binding: 5, bundle: 5 });
	});
	it("should start Miniflare with configured compatibility settings", async () => {
		const controller = new LocalRuntimeController();
		teardown(() => controller.teardown());

		// `global_navigator` was enabled by default on `2022-03-21`:
		// https://developers.cloudflare.com/workers/configuration/compatibility-dates/#global-navigator
		const disabledDate = "2022-03-20";
		const enabledDate = "2022-03-21";

		const config: StartDevWorkerOptions = {
			name: "worker",
			script: unusable(),
			compatibilityDate: disabledDate,
		};
		const bundle = singleModuleBundle`export default {
			fetch(request, env, ctx) { return new Response(typeof navigator); }
		}`;

		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		let event = await waitForReloadComplete(controller);
		let res = await fetch(joinUrlParts(event.proxyData.userWorkerUrl));
		expect(await res.text()).toBe("undefined");

		// Check respects compatibility date
		config.compatibilityDate = enabledDate;
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		event = await waitForReloadComplete(controller);
		res = await fetch(joinUrlParts(event.proxyData.userWorkerUrl));
		expect(await res.text()).toBe("object");

		// Check respects compatibility flags
		config.compatibilityDate = disabledDate;
		config.compatibilityFlags = ["global_navigator"];
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		event = await waitForReloadComplete(controller);
		res = await fetch(joinUrlParts(event.proxyData.userWorkerUrl));
		expect(await res.text()).toBe("object");
	});
	it("should start inspector on random port and allow debugging", async () => {
		const controller = new LocalRuntimeController();
		teardown(() => controller.teardown());

		const config: StartDevWorkerOptions = {
			name: "worker",
			script: unusable(),
		};
		const bundle = singleModuleBundle`export default {
			fetch(request, env, ctx) {
				debugger;
				return new Response("body");
			}
		}`;
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		const event = await waitForReloadComplete(controller);
		const url = joinUrlParts(event.proxyData.userWorkerUrl);
		const inspectorUrl = joinUrlParts(event.proxyData.userWorkerInspectorUrl);

		// Connect inspector WebSocket
		const ws = new WebSocket(inspectorUrl);
		const messages = events.on(ws, "message");
		async function nextMessage() {
			const messageEvent = (await messages.next()).value;
			return JSON.parse(messageEvent[0].toString());
		}

		// Enable `Debugger` domain
		await events.once(ws, "open");
		ws.send(JSON.stringify({ id: 0, method: "Debugger.enable" }));
		expect(await nextMessage()).toMatchObject({
			method: "Debugger.scriptParsed",
			params: { url: "file:///virtual/index.mjs" },
		});
		expect(await nextMessage()).toMatchObject({ id: 0 });

		// Send request and hit `debugger;` statement
		const resPromise = fetch(url);
		expect(await nextMessage()).toMatchObject({ method: "Debugger.paused" });

		// Resume execution
		ws.send(JSON.stringify({ id: 1, method: "Debugger.resume" }));
		expect(await nextMessage()).toMatchObject({ id: 1 });
		const res = await resPromise;
		expect(await res.text()).toBe("body");
	});
});

describe("Bindings", () => {
	it("should expose basic bindings", async () => {
		const controller = new LocalRuntimeController();
		teardown(() => controller.teardown());

		const config: StartDevWorkerOptions = {
			name: "worker",
			script: unusable(),
			bindings: {
				TEXT: { type: "var", value: "text" },
				OBJECT: { type: "var", value: { a: { b: 1 } } },
				DATA: { type: "var", value: new Uint8Array([1, 2, 3]) },
			},
		};
		const bundle = singleModuleBundle`export default {
			fetch(request, env, ctx) {
				const body = JSON.stringify(env, (key, value) => {
					if (value instanceof ArrayBuffer) {
						return { $type: "ArrayBuffer", value: Array.from(new Uint8Array(value)) };
					}
					return value;
				});
				return new Response(body);
			}
		}`;
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });

		const event = await waitForReloadComplete(controller);
		const res = await fetch(joinUrlParts(event.proxyData.userWorkerUrl));
		expect(await res.json()).toEqual({
			TEXT: "text",
			OBJECT: { a: { b: 1 } },
			DATA: { $type: "ArrayBuffer", value: [1, 2, 3] },
		});
	});
	it("should expose WebAssembly module bindings in service workers", async () => {
		const controller = new LocalRuntimeController();
		teardown(() => controller.teardown());

		const config: StartDevWorkerOptions = {
			name: "worker",
			script: unusable(),
			bindings: {
				// `wasm-module` bindings aren't allowed in modules workers
				WASM: { type: "wasm-module", source: { contents: WASM_ADD_MODULE } },
			},
		};
		const bundle: Bundle = {
			type: "service-worker",
			serviceWorker: {
				contents: `addEventListener("fetch", (event) => {
					const addInstance = new WebAssembly.Instance(WASM);
					event.respondWith(new Response(addInstance.exports.add(1, 2)));
				});`,
			},
		};
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });

		const event = await waitForReloadComplete(controller);
		const res = await fetch(joinUrlParts(event.proxyData.userWorkerUrl));
		expect(await res.text()).toBe("3");
	});
	it("should persist cached data", async () => {
		const tmp = useTmp();
		const persist = path.join(tmp, "persist");
		const controller = new LocalRuntimeController();
		teardown(() => controller.teardown());

		const config: StartDevWorkerOptions = {
			name: "worker",
			script: unusable(),
			dev: { persist: { path: persist } },
		};
		const bundle = singleModuleBundle`export default {
			async fetch(request, env, ctx) {
				const key = "http://localhost/";
				if (request.method === "POST") {
					const response = new Response("cached", {
						headers: { "Cache-Control": "max-age=3600" }
					});
					await caches.default.put(key, response);
				}
				return (await caches.default.match(key)) ?? new Response("miss");
			}
		}`;
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });

		let event = await waitForReloadComplete(controller);
		let res = await fetch(joinUrlParts(event.proxyData.userWorkerUrl), {
			method: "POST",
		});
		expect(await res.text()).toBe("cached");

		// Check restarting uses persisted data
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		event = await waitForReloadComplete(controller);
		res = await fetch(joinUrlParts(event.proxyData.userWorkerUrl));
		expect(await res.text()).toBe("cached");

		// Check deleting persistence directory removes data
		await controller.teardown();
		fs.rmSync(persist, { recursive: true });
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		event = await waitForReloadComplete(controller);
		res = await fetch(joinUrlParts(event.proxyData.userWorkerUrl));
		expect(await res.text()).toBe("miss");
	});
	it("should expose KV namespace bindings", async () => {
		const tmp = useTmp();
		const persist = path.join(tmp, "persist");
		const controller = new LocalRuntimeController();
		teardown(() => controller.teardown());

		const config: StartDevWorkerOptions = {
			name: "worker",
			script: unusable(),
			bindings: { NAMESPACE: { type: "kv", id: "ns" } },
			dev: { persist: { path: persist } },
		};
		const bundle = singleModuleBundle`export default {
			async fetch(request, env, ctx) {
				if (request.method === "POST") await env.NAMESPACE.put("key", "value");
				return new Response(await env.NAMESPACE.get("key"));
			}
		}`;
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });

		let event = await waitForReloadComplete(controller);
		let res = await fetch(joinUrlParts(event.proxyData.userWorkerUrl), {
			method: "POST",
		});
		expect(await res.text()).toBe("value");

		// Check restarting uses persisted data
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		event = await waitForReloadComplete(controller);
		res = await fetch(joinUrlParts(event.proxyData.userWorkerUrl));
		expect(await res.text()).toBe("value");

		// Check deleting persistence directory removes data
		await controller.teardown();
		fs.rmSync(persist, { recursive: true });
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		event = await waitForReloadComplete(controller);
		res = await fetch(joinUrlParts(event.proxyData.userWorkerUrl));
		expect(await res.text()).toBe("");
	});
	it("should support Workers Sites bindings", async () => {
		const tmp = useTmp();
		const controller = new LocalRuntimeController();
		teardown(() => controller.teardown());

		fs.writeFileSync(path.join(tmp, "company.txt"), "👨‍👩‍👧‍👦");
		fs.writeFileSync(path.join(tmp, "charts.xlsx"), "📊");
		fs.writeFileSync(path.join(tmp, "secrets.txt"), "🔐");

		const config: StartDevWorkerOptions = {
			name: "worker",
			script: unusable(),
			site: { path: tmp, include: ["*.txt"] },
		};
		const bundle = singleModuleBundle`
		import manifestJSON from "__STATIC_CONTENT_MANIFEST";
		const manifest = JSON.parse(manifestJSON);
		export default {
			async fetch(request, env, ctx) {
				const { pathname } = new URL(request.url);
				const path = pathname.substring(1);
				const key = manifest[path];
				if (key === undefined) return new Response(null, { status: 404 });
				const value = await env.__STATIC_CONTENT.get(key, "stream");
				if (value === null) return new Response(null, { status: 404 });
				return new Response(value);
			}
		}`;

		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		let event = await waitForReloadComplete(controller);
		let url = joinUrlParts(event.proxyData.userWorkerUrl);
		let res = await fetch(new URL("/company.txt", url));
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("👨‍👩‍👧‍👦");
		res = await fetch(new URL("/charts.xlsx", url));
		expect(res.status).toBe(404);
		res = await fetch(new URL("/secrets.txt", url));
		expect(res.status).toBe(200);

		config.site = { path: tmp, exclude: ["secrets.txt"] };
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		event = await waitForReloadComplete(controller);
		url = joinUrlParts(event.proxyData.userWorkerUrl);
		res = await fetch(new URL("/company.txt", url));
		expect(res.status).toBe(200);
		res = await fetch(new URL("/charts.xlsx", url));
		expect(res.status).toBe(200);
		res = await fetch(new URL("/secrets.txt", url));
		expect(res.status).toBe(404);
	});
	it("should expose R2 bucket bindings", async () => {
		const tmp = useTmp();
		const persist = path.join(tmp, "persist");
		const controller = new LocalRuntimeController();
		teardown(() => controller.teardown());

		const config: StartDevWorkerOptions = {
			name: "worker",
			script: unusable(),
			bindings: { BUCKET: { type: "r2", bucket_name: "bucket" } },
			dev: { persist: { path: persist } },
		};
		const bundle = singleModuleBundle`export default {
			async fetch(request, env, ctx) {
				if (request.method === "POST") await env.BUCKET.put("key", "value");
				const object = await env.BUCKET.get("key");
				return new Response(object?.body);
			}
		}`;
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });

		let event = await waitForReloadComplete(controller);
		let res = await fetch(joinUrlParts(event.proxyData.userWorkerUrl), {
			method: "POST",
		});
		expect(await res.text()).toBe("value");

		// Check restarting uses persisted data
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		event = await waitForReloadComplete(controller);
		res = await fetch(joinUrlParts(event.proxyData.userWorkerUrl));
		expect(await res.text()).toBe("value");

		// Check deleting persistence directory removes data
		await controller.teardown();
		fs.rmSync(persist, { recursive: true });
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		event = await waitForReloadComplete(controller);
		res = await fetch(joinUrlParts(event.proxyData.userWorkerUrl));
		expect(await res.text()).toBe("");
	});
	it("should expose D1 database bindings", async () => {
		const tmp = useTmp();
		const persist = path.join(tmp, "persist");
		const controller = new LocalRuntimeController();
		teardown(() => controller.teardown());

		const config: StartDevWorkerOptions = {
			name: "worker",
			script: unusable(),
			bindings: {
				DB: { type: "d1", database_name: "db-name", database_id: "db" },
			},
			dev: { persist: { path: persist } },
		};
		const bundle = singleModuleBundle`export default {
			async fetch(request, env, ctx) {
				await env.DB.exec("CREATE TABLE IF NOT EXISTS entries (key text PRIMARY KEY, value text)");
				if (request.method === "POST") {
					await env.DB.prepare("INSERT INTO entries (key, value) VALUES (?, ?)").bind("key", "value").run();
				}
				const result = await env.DB.prepare("SELECT * FROM entries").all();
				return Response.json(result.results);
			}
		}`;
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });

		let event = await waitForReloadComplete(controller);
		let res = await fetch(joinUrlParts(event.proxyData.userWorkerUrl), {
			method: "POST",
		});
		expect(await res.json()).toEqual([{ key: "key", value: "value" }]);

		// Check restarting uses persisted data
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		event = await waitForReloadComplete(controller);
		res = await fetch(joinUrlParts(event.proxyData.userWorkerUrl));
		expect(await res.json()).toEqual([{ key: "key", value: "value" }]);

		// Check deleting persistence directory removes data
		await controller.teardown();
		fs.rmSync(persist, { recursive: true });
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		event = await waitForReloadComplete(controller);
		res = await fetch(joinUrlParts(event.proxyData.userWorkerUrl));
		expect(await res.json()).toEqual([]);
	});
	it("should expose queue producer bindings and consume queue messages", async () => {
		const tmp = useTmp();
		const persist = path.join(tmp, "persist");
		const controller = new LocalRuntimeController();
		teardown(() => controller.teardown());

		const reportPromise = new DeferredPromise<unknown>();
		const config: StartDevWorkerOptions = {
			name: "worker",
			script: unusable(),
			bindings: {
				QUEUE: { type: "queue-producer", name: "queue" },
				BATCH_REPORT: {
					type: "service",
					async service(request) {
						reportPromise.resolve(await request.json());
						return new Response(null, { status: 204 });
					},
				},
			},
			triggers: [{ type: "queue-consumer", name: "queue", maxBatchTimeout: 0 }],
			dev: { persist: { path: persist } },
		};
		const bundle = singleModuleBundle`export default {
			async fetch(request, env, ctx) {
				await env.QUEUE.send("message");
				return new Response(null, { status: 204 });
			},
			async queue(batch, env, ctx) {
				await env.BATCH_REPORT.fetch("http://placeholder", {
					method: "POST",
					body: JSON.stringify(batch.messages.map(({ body }) => body))
				});
			}
		}`;
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });

		const event = await waitForReloadComplete(controller);
		const res = await fetch(joinUrlParts(event.proxyData.userWorkerUrl), {
			method: "POST",
		});
		expect(res.status).toBe(204);
		expect(await reportPromise).toEqual(["message"]);
	});
	it("should expose hyperdrive bindings", async () => {
		// Start echo TCP server
		const server = net.createServer((socket) => socket.pipe(socket));
		const listeningPromise = events.once(server, "listening");
		server.listen(0, "127.0.0.1");
		teardown(() => util.promisify(server.close.bind(server))());
		await listeningPromise;
		const address = server.address();
		assert(typeof address === "object" && address !== null);
		const port = address.port;

		// Start runtime with hyperdrive binding
		const controller = new LocalRuntimeController();
		teardown(() => controller.teardown());

		const localConnectionString = `postgres://username:password@127.0.0.1:${port}/db`;
		const config: StartDevWorkerOptions = {
			name: "worker",
			script: unusable(),
			bindings: { DB: { type: "hyperdrive", id: "db", localConnectionString } },
		};
		const bundle = singleModuleBundle`export default {
			async fetch(request, env, ctx) {
				const socket = env.DB.connect();
				const writer = socket.writable.getWriter();
				await writer.write(new TextEncoder().encode("👋"));
				await writer.close();
				return new Response(socket.readable);
			}
		}`;
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });

		const event = await waitForReloadComplete(controller);
		const res = await fetch(joinUrlParts(event.proxyData.userWorkerUrl));
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("👋");
	});
});

describe("Multi-Worker Bindings", () => {
	it("should expose service bindings to other workers", async () => {
		const controller = new LocalRuntimeController();
		teardown(() => controller.teardown());

		const config: StartDevWorkerOptions = {
			name: "a",
			script: unusable(),
			bindings: {
				A: { type: "service", service: { name: "a" } }, // Self binding
				B: {
					type: "service",
					service(request) {
						const body = `b:${request.url}`;
						return new Response(body);
					},
				},
				C: { type: "service", service: { name: "c" } },
				D: { type: "service", service: { name: "d" } },
				E: { type: "service", service: { name: "e" } }, // Invalid binding
			},
			dev: {
				getRegisteredWorker(name) {
					if (!["c", "d"].includes(name)) return undefined;
					return (request) => {
						const body = `registered:${name}:${request.url}`;
						return new Response(body);
					};
				},
			},
		};
		const bundle = singleModuleBundle`export default {
			async fetch(request, env, ctx) {
				const { pathname } = new URL(request.url);
				const name = pathname.substring(1);
				const res = await env[name]?.fetch("http://placeholder/");
				return new Response("a:" + await res?.text());
			}
		}`;

		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		let event = await waitForReloadComplete(controller);
		let url = joinUrlParts(event.proxyData.userWorkerUrl);
		let res = await fetch(new URL("/A", url));
		expect(await res.text()).toBe("a:a:undefined");
		res = await fetch(new URL("/B", url));
		expect(await res.text()).toBe("a:b:http://placeholder/");
		res = await fetch(new URL("/C", url));
		expect(await res.text()).toBe("a:registered:c:http://placeholder/");
		res = await fetch(new URL("/D", url));
		expect(await res.text()).toBe("a:registered:d:http://placeholder/");
		res = await fetch(new URL("/E", url));
		expect(await res.text()).toMatchInlineSnapshot(
			'"a:[wrangler] Couldn\'t find `wrangler dev` session for service \\"e\\" to proxy to`"'
		);

		// Check with no `getRegisteredWorker()` function defined
		config.dev = {};
		controller.onBundleStart({ type: "bundleStart", config });
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		event = await waitForReloadComplete(controller);
		url = joinUrlParts(event.proxyData.userWorkerUrl);
		res = await fetch(new URL("/C", url));
		expect(await res.text()).toMatchInlineSnapshot(
			'"a:[wrangler] Couldn\'t find `wrangler dev` session for service \\"c\\" to proxy to`"'
		);
	});
	it("should expose Durable Object bindings to other workers", async () => {
		const controllerA = new LocalRuntimeController();
		teardown(() => controllerA.teardown());

		// Start entry worker
		let urlB: URL | undefined = undefined;
		const configA: StartDevWorkerOptions = {
			name: "a",
			script: unusable(),
			compatibilityFlags: ["no_cf_botmanagement_default"],
			bindings: {
				A_OBJECT_1: {
					// Binding to object in self without `service`
					type: "durable-object",
					className: "AObject1",
				},
				A_OBJECT_2: {
					// Binding to object in self with `service`
					type: "durable-object",
					className: "AObject2",
					service: { name: "a" },
				},
				B_OBJECT_1: {
					// Binding to object in another service
					type: "durable-object",
					className: "BObject1",
					service: { name: "b" },
				},
				B_OBJECT_2: {
					// Binding to non-existent object in another service
					type: "durable-object",
					className: "BObject2",
					service: { name: "b" },
				},
				C_OBJECT_1: {
					// Binding to object in non-existent service
					type: "durable-object",
					className: "CObject1",
					service: { name: "c" },
				},
			},
			dev: {
				getRegisteredWorker(name) {
					if (name !== "b") return undefined;
					return (request) => {
						assert(urlB !== undefined);
						const url = new URL(request.url);
						url.protocol = urlB.protocol;
						url.host = urlB.host;
						return fetch(url, request);
					};
				},
			},
		};
		const objectClassBody = `{
			async fetch(request) {
				return Response.json({
					source: this.constructor.name,
					method: request.method,
					url: request.url,
					headers: Object.fromEntries(request.headers),
					cf: request.cf,
					body: await request.text(),
				});
			}
		}`;
		const bundleA = singleModuleBundle`
		export class AObject1 ${objectClassBody}
		export class AObject2 extends AObject1 {}
		export default {
			fetch(request, env, ctx) {
				const { pathname } = new URL(request.url);
				const name = pathname.substring(1);
				const ns = env[name];
				if (ns === undefined) return new Response(null, { status: 404 });

				const id = ns.newUniqueId();
				const stub = ns.get(id);
				return stub.fetch("http://placeholder/", {
					method: "POST",
					headers: { "Content-Type": "text/plain" },
					cf: { secret: "🔑" },
					body: "🩻",
				});
			}
		}`;
		controllerA.onBundleStart({ type: "bundleStart", config: configA });
		controllerA.onBundleComplete({
			type: "bundleComplete",
			config: configA,
			bundle: bundleA,
		});
		let eventA = await waitForReloadComplete(controllerA);
		let urlA = joinUrlParts(eventA.proxyData.userWorkerUrl);

		// Start other worker
		const controllerB = new LocalRuntimeController();
		teardown(() => controllerB.teardown());
		const configB: StartDevWorkerOptions = {
			name: "b",
			script: unusable(),
			compatibilityFlags: ["no_cf_botmanagement_default"],
			bindings: {
				B_OBJECT_1: { type: "durable-object", className: "BObject1" },
			},
		};
		const bundleB = singleModuleBundle`export class BObject1 ${objectClassBody};`;
		controllerB.onBundleStart({ type: "bundleStart", config: configB });
		controllerB.onBundleComplete({
			type: "bundleComplete",
			config: configB,
			bundle: bundleB,
		});
		const eventB = await waitForReloadComplete(controllerB);
		urlB = joinUrlParts(eventB.proxyData.userWorkerUrl);

		// Check objects in entry worker
		let res = await fetch(new URL("/A_OBJECT_1", urlA));
		expect(await res.json()).toMatchInlineSnapshot(`
			{
			  "body": "🩻",
			  "cf": {
			    "secret": "🔑",
			  },
			  "headers": {
			    "content-length": "4",
			    "content-type": "text/plain",
			  },
			  "method": "POST",
			  "source": "AObject1",
			  "url": "http://placeholder/",
			}
		`);
		res = await fetch(new URL("/A_OBJECT_2", urlA));
		expect(await res.json()).toMatchObject({ source: "AObject2" });

		// Check objects in other worker
		res = await fetch(new URL("/B_OBJECT_1", urlA));
		expect(await res.json()).toMatchInlineSnapshot(`
			{
			  "body": "🩻",
			  "cf": {
			    "secret": "🔑",
			  },
			  "headers": {
			    "content-length": "4",
			    "content-type": "text/plain",
			  },
			  "method": "POST",
			  "source": "BObject1",
			  "url": "http://placeholder/",
			}
		`);

		// Check missing Durable Object class
		res = await fetch(new URL("/B_OBJECT_2", urlA));
		expect(await res.text()).toMatchInlineSnapshot(
			'"[wrangler] Couldn\'t find class \\"BObject2\\" in service \\"b\\" to proxy to"'
		);

		// Check missing service
		res = await fetch(new URL("/C_OBJECT_1", urlA));
		expect(await res.text()).toMatchInlineSnapshot(
			'"[wrangler] Couldn\'t find `wrangler dev` session for service \\"c\\" to proxy to`"'
		);

		// Check with no `getRegisteredWorker()` function defined
		configA.dev = {};
		controllerA.onBundleStart({ type: "bundleStart", config: configA });
		controllerA.onBundleComplete({
			type: "bundleComplete",
			config: configA,
			bundle: bundleA,
		});
		eventA = await waitForReloadComplete(controllerA);
		urlA = joinUrlParts(eventA.proxyData.userWorkerUrl);
		res = await fetch(new URL("/B_OBJECT_1", urlA));
		expect(await res.text()).toMatchInlineSnapshot(
			'"[wrangler] Couldn\'t find `wrangler dev` session for service \\"b\\" to proxy to`"'
		);
	});
});
