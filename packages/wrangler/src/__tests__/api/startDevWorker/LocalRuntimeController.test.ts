/* eslint-disable react-hooks/rules-of-hooks */
import events from "node:events";
import fs, { readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import util from "node:util";
import { DeferredPromise, Response } from "miniflare";
import dedent from "ts-dedent";
import { fetch } from "undici";
import { assert, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { LocalRuntimeController } from "../../../api/startDevWorker/LocalRuntimeController";
import { urlFromParts } from "../../../api/startDevWorker/utils";
import { RuleTypeToModuleType } from "../../../deployment-bundle/module-collection";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { runInTempDir } from "../../helpers/run-in-tmp";
import { useTeardown } from "../../helpers/teardown";
import { unusable } from "../../helpers/unusable";
import type {
	Bundle,
	File,
	ReloadCompleteEvent,
	StartDevWorkerOptions,
} from "../../../api";
import type { Rule } from "../../../config/environment";

export type Module<ModuleType extends Rule["type"] = Rule["type"]> = File<
	string | Uint8Array
> & {
	/** Name of the module, used for module resolution, path may be undefined if this is a virtual module */
	name: string;
	/** How this module should be interpreted */
	type: ModuleType;
};

const isWindows = process.platform === "win32";
function getTextFileContents(file: File<string | Uint8Array>) {
	if ("contents" in file) {
		if (typeof file.contents === "string") {
			return file.contents;
		}
		if (file.contents instanceof Buffer) {
			return file.contents.toString();
		}
		return Buffer.from(file.contents).toString();
	}
	return readFileSync(file.path, "utf8");
}
// // WebAssembly module containing single `func add(i32, i32): i32` export.
// // Generated using https://webassembly.github.io/wabt/demo/wat2wasm/.
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

type TestBundle =
	| string
	| ({
			/** Files that were used in the creation of this bundle, and how much they contributed to the output */
			inputs?: Record<string, { bytesInOutput: number }>;
	  } & (
			| {
					type: "service-worker";
					/** Service worker style entrypoint */
					serviceWorker: File;
					/** Additional modules to add as global variables */
					modules?: Module<"Text" | "Data" | "CompiledWasm">[];
			  }
			| {
					type: "modules";
					/** ESModule entrypoint and additional modules to include */
					modules: [Module<"ESModule">, ...Module[]];
			  }
	  ));
function makeEsbuildBundle(testBundle: TestBundle): Bundle {
	const bundle: Bundle = {
		type: "esm",
		modules: [],
		id: 0,
		path: "/virtual/index.mjs",
		entrypointSource: "",
		entry: {
			file: "index.mjs",
			projectRoot: "/virtual/",
			configPath: undefined,
			format: "modules",
			moduleRoot: "/virtual",
			name: undefined,
			exports: [],
		},
		dependencies: {},
		sourceMapPath: undefined,
		sourceMapMetadata: undefined,
	};
	if (typeof testBundle === "string") {
		bundle.entrypointSource = testBundle;
	} else if ("serviceWorker" in testBundle) {
		bundle.entrypointSource = getTextFileContents(testBundle.serviceWorker);
		bundle.entry.format = "service-worker";
		bundle.modules = (testBundle.modules ?? []).map((m) => ({
			type: RuleTypeToModuleType[m.type],
			name: m.name,
			filePath: path.join("/virtual", m.name),
			content: getTextFileContents(m),
		}));
	} else {
		bundle.entrypointSource = getTextFileContents(testBundle.modules[0]);
		bundle.modules = (testBundle.modules.slice(1) ?? []).map((m) => ({
			type: RuleTypeToModuleType[m.type],
			name: m.name,
			filePath: path.join("/virtual", m.name),
			content: getTextFileContents(m),
		}));
	}

	return bundle;
}

function configDefaults(
	config: Partial<StartDevWorkerOptions>
): StartDevWorkerOptions {
	return {
		name: "test-worker",
		complianceRegion: undefined,
		entrypoint: "NOT_REAL",
		projectRoot: "NOT_REAL",
		build: unusable<StartDevWorkerOptions["build"]>(),
		legacy: {},
		dev: { persist: "./persist" },
		...config,
	};
}

describe("LocalRuntimeController", () => {
	const teardown = useTeardown();
	mockConsoleMethods();
	runInTempDir();

	describe("Core", () => {
		it("should start Miniflare with module worker", async () => {
			const controller = new LocalRuntimeController();
			teardown(() => controller.teardown());

			const config = {
				name: "worker",
				entrypoint: "NOT_REAL",
				compatibilityFlags: ["nodejs_compat_v2"],
				compatibilityDate: "2023-10-01",
			};
			const bundle: Bundle = {
				type: "esm",
				modules: [
					{
						type: "commonjs",
						name: "add.cjs",
						filePath: "/virtual/cjs/add.cjs",
						content: `
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
						type: "commonjs",
						name: "base64.cjs",
						filePath: "/virtual/node/base64.cjs",
						content: `module.exports = {
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
					{
						type: "text",
						name: "data/wave.txt",
						filePath: "/virtual/data/wave.txt",
						content: "👋",
					},
					{
						type: "buffer",
						name: "data/wave.bin",
						filePath: "/virtual/data/wave.bin",
						content: "🌊",
					},
					{
						type: "compiled-wasm",
						name: "add.wasm",
						filePath: "/virtual/add.wasm",
						content: WASM_ADD_MODULE,
					},
				],
				id: 0,
				path: "/virtual/esm/index.mjs",
				entrypointSource: dedent/*javascript*/ `
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
						} else if (pathname === "/throw-other-commonjs") {
							try { base64.throw(); } catch (e) { return new Response(e.stack); }
						} else {
							return new Response(null, { status: 404 });
						}
					}
				}
			`,
				entry: {
					file: "esm/index.mjs",
					projectRoot: "/virtual/",
					configPath: undefined,
					format: "modules",
					moduleRoot: "/virtual",
					name: undefined,
					exports: [],
				},
				dependencies: {},
				sourceMapPath: undefined,
				sourceMapMetadata: undefined,
			};
			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});
			const event = await waitForReloadComplete(controller);
			const url = urlFromParts(event.proxyData.userWorkerUrl);

			// Check all module types
			let res = await fetch(url);
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ message: "👋🌊", sum: 3 });

			// Check stack traces from ESModule and CommonJS modules include file path
			res = await fetch(new URL("/throw-commonjs", url));
			expect(res.status).toBe(200);
			if (isWindows) {
				expect(normalizeDrive(await res.text())).toMatchInlineSnapshot(`
			"Error: Oops!
			    at Object.throw (file:///D:/virtual/cjs/add.cjs:7:14)
			    at Object.fetch (file:///D:/virtual/esm/index.mjs:15:19)"
			`);

				// Check stack traces from CommonJS modules include file path
				res = await fetch(new URL("/throw-other-commonjs", url));
				expect(res.status).toBe(200);
				expect(normalizeDrive(await res.text())).toMatchInlineSnapshot(`
			"Error: Oops!
			    at Object.throw (file:///D:/virtual/node/base64.cjs:9:14)
			    at Object.fetch (file:///D:/virtual/esm/index.mjs:17:22)"
			`);
			} else {
				expect(await res.text()).toMatchInlineSnapshot(`
			"Error: Oops!
			    at Object.throw (file:///virtual/cjs/add.cjs:7:14)
			    at Object.fetch (file:///virtual/esm/index.mjs:15:19)"
			`);

				// Check stack traces from CommonJS modules include file path
				res = await fetch(new URL("/throw-other-commonjs", url));
				expect(res.status).toBe(200);
				expect(await res.text()).toMatchInlineSnapshot(`
			"Error: Oops!
			    at Object.throw (file:///virtual/node/base64.cjs:9:14)
			    at Object.fetch (file:///virtual/esm/index.mjs:17:22)"
			`);
			}
		});
		it("should start Miniflare with service worker", async () => {
			const controller = new LocalRuntimeController();
			teardown(() => controller.teardown());

			const config = {
				name: "worker",
				entrypoint: "NOT_REAL",
			};
			const bundle: Bundle = {
				type: "commonjs",
				entrypointSource: dedent/*javascript*/ `
				addEventListener("fetch", (event) => {
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
				});
			`,
				modules: [
					{
						type: "text",
						name: "data/one.txt",
						content: "one",
						filePath: "/virtual/data/one.txt",
					},
					{
						type: "buffer",
						name: "data/two.bin",
						content: "two",
						filePath: "/virtual/data/two.bin",
					},
					{
						type: "compiled-wasm",
						name: "add.wasm",
						content: WASM_ADD_MODULE,
						filePath: "/virtual/add.wasm",
					},
				],
				id: 0,
				path: "/virtual/index.js",
				entry: {
					file: "index.js",
					projectRoot: "/virtual/",
					configPath: undefined,
					format: "service-worker",
					moduleRoot: "/virtual",
					name: undefined,
					exports: [],
				},
				dependencies: {},
				sourceMapPath: undefined,
				sourceMapMetadata: undefined,
			};
			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});
			const event = await waitForReloadComplete(controller);
			const url = urlFromParts(event.proxyData.userWorkerUrl);

			// Check additional modules added to global scope
			let res = await fetch(url);
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ one: "one", two: "two", three: 3 });

			// Check stack traces include file path
			res = await fetch(new URL("/throw", url));
			expect(res.status).toBe(200);
			if (isWindows) {
				expect(normalizeDrive(await res.text())).toMatchInlineSnapshot(`
			"Error: Oops!
			    at file:///D:/virtual/index.js:12:15"
			`);
			} else {
				expect(normalizeDrive(await res.text())).toMatchInlineSnapshot(`
			"Error: Oops!
			    at file:///virtual/index.js:12:15"
			`);
			}
		});
		it("should update the running Miniflare instance", async () => {
			const controller = new LocalRuntimeController();
			teardown(() => controller.teardown());

			function update(version: number) {
				const config = {
					name: "worker",
					entrypoint: "NOT_REAL",
					bindings: {
						VERSION: { type: "json", value: version },
					},
				} satisfies Partial<StartDevWorkerOptions>;
				const bundle = makeEsbuildBundle(dedent/*javascript*/ `
					export default {
						fetch(request, env, ctx) {
							return Response.json({ binding: env.VERSION, bundle: ${version} });
						}
					}
				`);
				controller.onBundleStart({
					type: "bundleStart",
					config: configDefaults(config),
				});
				controller.onBundleComplete({
					type: "bundleComplete",
					config: configDefaults(config),
					bundle,
				});
			}

			// Start worker
			update(1);
			let event = await waitForReloadComplete(controller);
			let res = await fetch(urlFromParts(event.proxyData.userWorkerUrl));
			expect(await res.json()).toEqual({ binding: 1, bundle: 1 });

			// Update worker and check config/bundle updated
			update(2);
			event = await waitForReloadComplete(controller);
			res = await fetch(urlFromParts(event.proxyData.userWorkerUrl));
			expect(await res.json()).toEqual({ binding: 2, bundle: 2 });

			// Update worker multiple times and check only latest config/bundle used
			const eventPromise = waitForReloadComplete(controller);
			update(3);
			update(4);
			update(5);
			event = await eventPromise;
			res = await fetch(urlFromParts(event.proxyData.userWorkerUrl));
			expect(await res.json()).toEqual({ binding: 5, bundle: 5 });
		});
		it("should start Miniflare with configured compatibility settings", async () => {
			const controller = new LocalRuntimeController();
			teardown(() => controller.teardown());

			// `global_navigator` was enabled by default on `2022-03-21`:
			// https://developers.cloudflare.com/workers/configuration/compatibility-dates/#global-navigator
			const disabledDate = "2022-03-20";
			const enabledDate = "2022-03-21";

			const config: Partial<StartDevWorkerOptions> = {
				name: "worker",
				entrypoint: "NOT_REAL",
				compatibilityDate: disabledDate,
			};
			const bundle = makeEsbuildBundle(dedent/*javascript*/ `
				export default {
					fetch(request, env, ctx) { return new Response(typeof navigator); }
				}
			`);

			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});
			let event = await waitForReloadComplete(controller);
			let res = await fetch(urlFromParts(event.proxyData.userWorkerUrl));
			expect(await res.text()).toBe("undefined");

			// Check respects compatibility date
			config.compatibilityDate = enabledDate;
			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});
			event = await waitForReloadComplete(controller);
			res = await fetch(urlFromParts(event.proxyData.userWorkerUrl));
			expect(await res.text()).toBe("object");

			// Check respects compatibility flags
			config.compatibilityDate = disabledDate;
			config.compatibilityFlags = ["global_navigator"];
			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});
			event = await waitForReloadComplete(controller);
			res = await fetch(urlFromParts(event.proxyData.userWorkerUrl));
			expect(await res.text()).toBe("object");
		});
		it("should start inspector on random port and allow debugging", async () => {
			const controller = new LocalRuntimeController();
			teardown(() => controller.teardown());

			const config: Partial<StartDevWorkerOptions> = {
				name: "worker",
				entrypoint: "NOT_REAL",
			};
			const bundle = makeEsbuildBundle(dedent/*javascript*/ `
				export default {
					fetch(request, env, ctx) {
						debugger;
						return new Response("body");
					}
				}
			`);
			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});
			const event = await waitForReloadComplete(controller);
			const url = urlFromParts(event.proxyData.userWorkerUrl);
			assert(event.proxyData.userWorkerInspectorUrl);
			const inspectorUrl = urlFromParts(event.proxyData.userWorkerInspectorUrl);

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
			if (isWindows) {
				expect(await nextMessage()).toMatchObject({
					method: "Debugger.scriptParsed",
					params: {
						url: expect.stringMatching(/file:\/\/\/[A-Z]:\/virtual\/index.mjs/),
					},
				});
			} else {
				expect(await nextMessage()).toMatchObject({
					method: "Debugger.scriptParsed",
					params: { url: "file:///virtual/index.mjs" },
				});
			}
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

			const config: Partial<StartDevWorkerOptions> = {
				name: "worker",
				entrypoint: "NOT_REAL",
				bindings: {
					TEXT: { type: "plain_text", value: "text" },
					OBJECT: { type: "json", value: { a: { b: 1 } } },
					DATA: {
						type: "data_blob",
						source: { contents: new Uint8Array([1, 2, 3]) },
					},
				},
			};
			const bundle = makeEsbuildBundle(dedent/*javascript*/ `
			export default {
				fetch(request, env, ctx) {
					const body = JSON.stringify(env, (key, value) => {
						if (value instanceof ArrayBuffer) {
							return { $type: "ArrayBuffer", value: Array.from(new Uint8Array(value)) };
						}
						return value;
					});
					return new Response(body);
				}
			}
		`);
			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});

			const event = await waitForReloadComplete(controller);
			const res = await fetch(urlFromParts(event.proxyData.userWorkerUrl));
			expect(await res.json()).toEqual({
				TEXT: "text",
				OBJECT: { a: { b: 1 } },
				DATA: { $type: "ArrayBuffer", value: [1, 2, 3] },
			});
		});
		it("should expose WebAssembly module bindings in service workers", async () => {
			const controller = new LocalRuntimeController();
			teardown(() => controller.teardown());

			const config: Partial<StartDevWorkerOptions> = {
				name: "worker",
				entrypoint: "NOT_REAL",
				bindings: {
					// `wasm-module` bindings aren't allowed in modules workers
					WASM: { type: "wasm_module", source: { contents: WASM_ADD_MODULE } },
				},
			};
			const bundle: Bundle = makeEsbuildBundle({
				type: "service-worker",
				serviceWorker: {
					contents: `addEventListener("fetch", (event) => {
					const addInstance = new WebAssembly.Instance(WASM);
					event.respondWith(new Response(addInstance.exports.add(1, 2)));
				});`,
				},
			});
			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});

			const event = await waitForReloadComplete(controller);
			const res = await fetch(urlFromParts(event.proxyData.userWorkerUrl));
			expect(await res.text()).toBe("3");
		});
		it("should persist cached data", async () => {
			const controller = new LocalRuntimeController();
			teardown(() => controller.teardown());

			const config: Partial<StartDevWorkerOptions> = {
				name: "worker",
				entrypoint: "NOT_REAL",
				dev: { persist: "./persist" },
			};

			const bundle = makeEsbuildBundle(`export default {
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
		}`);

			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});

			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});

			let event = await waitForReloadComplete(controller);
			let res = await fetch(urlFromParts(event.proxyData.userWorkerUrl), {
				method: "POST",
			});
			expect(await res.text()).toBe("cached");

			// Check restarting uses persisted data
			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});
			event = await waitForReloadComplete(controller);
			res = await fetch(urlFromParts(event.proxyData.userWorkerUrl));
			expect(await res.text()).toBe("cached");

			// Check deleting persistence directory removes data
			await controller.teardown();
			fs.rmSync("./persist", { recursive: true });
			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});
			event = await waitForReloadComplete(controller);
			res = await fetch(urlFromParts(event.proxyData.userWorkerUrl));
			expect(await res.text()).toBe("miss");
		});
		it("should expose KV namespace bindings", async () => {
			const controller = new LocalRuntimeController();
			teardown(() => controller.teardown());

			const config: Partial<StartDevWorkerOptions> = {
				name: "worker",
				entrypoint: "NOT_REAL",
				bindings: { NAMESPACE: { type: "kv_namespace", id: "ns" } },
				dev: { persist: "./persist" },
			};
			const bundle = makeEsbuildBundle(`export default {
			async fetch(request, env, ctx) {
				if (request.method === "POST") await env.NAMESPACE.put("key", "value");
				return new Response(await env.NAMESPACE.get("key"));
			}
		}`);
			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});

			let event = await waitForReloadComplete(controller);
			let res = await fetch(urlFromParts(event.proxyData.userWorkerUrl), {
				method: "POST",
			});
			expect(await res.text()).toBe("value");

			// Check restarting uses persisted data
			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});
			event = await waitForReloadComplete(controller);
			res = await fetch(urlFromParts(event.proxyData.userWorkerUrl));
			expect(await res.text()).toBe("value");

			// Check deleting persistence directory removes data
			await controller.teardown();
			fs.rmSync("./persist", { recursive: true });
			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});
			event = await waitForReloadComplete(controller);
			res = await fetch(urlFromParts(event.proxyData.userWorkerUrl));
			expect(await res.text()).toBe("");
		});
		it("should support Workers Sites bindings", async () => {
			const controller = new LocalRuntimeController();
			teardown(() => controller.teardown());

			fs.writeFileSync("company.txt", "👨‍👩‍👧‍👦");
			fs.writeFileSync("charts.xlsx", "📊");
			fs.writeFileSync("secrets.txt", "🔐");

			let config: Partial<StartDevWorkerOptions> = {
				name: "worker",
				entrypoint: "NOT_REAL",
				legacy: { site: { bucket: ".", include: ["*.txt"] } },
			};
			const bundle = makeEsbuildBundle(`
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
		}`);

			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});
			let event = await waitForReloadComplete(controller);
			let url = urlFromParts(event.proxyData.userWorkerUrl);
			let res = await fetch(new URL("/company.txt", url));
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("👨‍👩‍👧‍👦");
			res = await fetch(new URL("/charts.xlsx", url));
			expect(res.status).toBe(404);
			res = await fetch(new URL("/secrets.txt", url));
			expect(res.status).toBe(200);
			config = {
				...config,
				legacy: {
					...config.legacy,
					site: { bucket: ".", exclude: ["secrets.txt"] },
				},
			};
			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});
			event = await waitForReloadComplete(controller);
			url = urlFromParts(event.proxyData.userWorkerUrl);
			res = await fetch(new URL("/company.txt", url));
			expect(res.status).toBe(200);
			res = await fetch(new URL("/charts.xlsx", url));
			expect(res.status).toBe(200);
			res = await fetch(new URL("/secrets.txt", url));
			expect(res.status).toBe(404);
		});
		it("should expose R2 bucket bindings", async () => {
			const controller = new LocalRuntimeController();
			teardown(() => controller.teardown());

			const config: Partial<StartDevWorkerOptions> = {
				name: "worker",
				entrypoint: "NOT_REAL",
				bindings: { BUCKET: { type: "r2_bucket", bucket_name: "bucket" } },
				dev: { persist: "./persist" },
			};
			const bundle = makeEsbuildBundle(`export default {
			async fetch(request, env, ctx) {
				if (request.method === "POST") await env.BUCKET.put("key", "value");
				const object = await env.BUCKET.get("key");
				return new Response(object?.body);
			}
		}`);
			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});

			let event = await waitForReloadComplete(controller);
			let res = await fetch(urlFromParts(event.proxyData.userWorkerUrl), {
				method: "POST",
			});
			expect(await res.text()).toBe("value");

			// Check restarting uses persisted data
			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});
			event = await waitForReloadComplete(controller);
			res = await fetch(urlFromParts(event.proxyData.userWorkerUrl));
			expect(await res.text()).toBe("value");

			// Check deleting persistence directory removes data
			await controller.teardown();
			fs.rmSync("./persist", { recursive: true });
			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});
			event = await waitForReloadComplete(controller);
			res = await fetch(urlFromParts(event.proxyData.userWorkerUrl));
			expect(await res.text()).toBe("");
		});
		it("should expose D1 database bindings", async () => {
			const controller = new LocalRuntimeController();
			teardown(() => controller.teardown());

			const config: Partial<StartDevWorkerOptions> = {
				name: "worker",
				entrypoint: "NOT_REAL",
				bindings: {
					DB: { type: "d1", database_name: "db-name", database_id: "db" },
				},
				dev: { persist: "./persist" },
			};
			const bundle = makeEsbuildBundle(`export default {
			async fetch(request, env, ctx) {
				await env.DB.exec("CREATE TABLE IF NOT EXISTS entries (key text PRIMARY KEY, value text)");
				if (request.method === "POST") {
					await env.DB.prepare("INSERT INTO entries (key, value) VALUES (?, ?)").bind("key", "value").run();
				}
				const result = await env.DB.prepare("SELECT * FROM entries").all();
				return Response.json(result.results);
			}
		}`);
			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});

			let event = await waitForReloadComplete(controller);
			let res = await fetch(urlFromParts(event.proxyData.userWorkerUrl), {
				method: "POST",
			});
			expect(await res.json()).toEqual([{ key: "key", value: "value" }]);

			// Check restarting uses persisted data
			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});
			event = await waitForReloadComplete(controller);
			res = await fetch(urlFromParts(event.proxyData.userWorkerUrl));
			expect(await res.json()).toEqual([{ key: "key", value: "value" }]);

			// Check deleting persistence directory removes data
			await controller.teardown();
			fs.rmSync("./persist", { recursive: true });
			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});
			event = await waitForReloadComplete(controller);
			res = await fetch(urlFromParts(event.proxyData.userWorkerUrl));
			expect(await res.json()).toEqual([]);
		});
		it("should expose queue producer bindings and consume queue messages", async () => {
			const controller = new LocalRuntimeController();
			teardown(() => controller.teardown());

			const reportPromise = new DeferredPromise<unknown>();
			const config: Partial<StartDevWorkerOptions> = {
				name: "worker",
				entrypoint: "NOT_REAL",
				bindings: {
					QUEUE: { type: "queue", queue_name: "queue" },
					BATCH_REPORT: {
						type: "fetcher",
						async fetcher(request) {
							reportPromise.resolve(await request.json());
							return new Response(null, { status: 204 });
						},
					},
				},
				triggers: [
					{ type: "queue-consumer", queue: "queue", max_batch_timeout: 0 },
				],
				dev: { persist: "./persist" },
			};
			const bundle = makeEsbuildBundle(`export default {
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
		}`);
			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});

			const event = await waitForReloadComplete(controller);
			const res = await fetch(urlFromParts(event.proxyData.userWorkerUrl), {
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
			const config: Partial<StartDevWorkerOptions> = {
				name: "worker",
				entrypoint: "NOT_REAL",
				bindings: {
					DB: { type: "hyperdrive", id: "db", localConnectionString },
				},
			};
			const bundle = makeEsbuildBundle(`export default {
			async fetch(request, env, ctx) {
				const socket = env.DB.connect();
				const writer = socket.writable.getWriter();
				await writer.write(new TextEncoder().encode("👋"));
				await writer.close();
				return new Response(socket.readable);
			}
		}`);
			controller.onBundleStart({
				type: "bundleStart",
				config: configDefaults(config),
			});
			controller.onBundleComplete({
				type: "bundleComplete",
				config: configDefaults(config),
				bundle,
			});

			const event = await waitForReloadComplete(controller);
			const res = await fetch(urlFromParts(event.proxyData.userWorkerUrl));
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("👋");
		});
	});
});

function normalizeDrive(p: string): string {
	return p.replaceAll(/file:\/\/\/[A-Z]:/g, "file:///D:");
}
