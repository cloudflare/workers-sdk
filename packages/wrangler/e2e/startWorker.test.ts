import assert from "assert";
import events from "events";
import path from "path";
import { setTimeout } from "timers/promises";
import getPort from "get-port";
import dedent from "ts-dedent";
import undici from "undici";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import type { DevToolsEvent } from "../src/api";

const OPTIONS = [
	{ remote: false },
	...(CLOUDFLARE_ACCOUNT_ID ? [{ remote: true }] : []),
];

type Wrangler = Awaited<ReturnType<WranglerE2ETestHelper["importWrangler"]>>;

function waitForMessageContaining<T>(ws: WebSocket, value: string): Promise<T> {
	return new Promise((resolve) => {
		ws.addEventListener("message", (event) => {
			assert(typeof event.data === "string");
			if (event.data.includes(value)) {
				resolve(JSON.parse(event.data));
			}
		});
	});
}

function collectMessagesContaining<T>(
	ws: WebSocket,
	value: string,
	collection: T[] = []
) {
	ws.addEventListener("message", (event) => {
		assert(typeof event.data === "string");
		if (event.data.includes(value)) {
			collection.push(JSON.parse(event.data));
		}
	});

	return collection;
}

describe("DevEnv", () => {
	let helper: WranglerE2ETestHelper;
	let wrangler: Wrangler;
	let startWorker: Wrangler["unstable_startWorker"];
	beforeEach(async () => {
		helper = new WranglerE2ETestHelper();
		wrangler = await helper.importWrangler();
		startWorker = wrangler.unstable_startWorker;
	});

	describe.each(OPTIONS)("(remote: $remote)", ({ remote }) => {
		it("ProxyWorker buffers requests while runtime reloads", async (t) => {
			t.onTestFinished(() => worker?.dispose());

			const script = dedent`
			export default {
				fetch() {
					return new Response("body:1");
				}
			}
		`;

			await helper.seed({
				"src/index.ts": script,
			});

			const worker = await startWorker({
				entrypoint: path.resolve(helper.tmpPath, "src/index.ts"),

				dev: {
					remote,
					server: { port: 0 },
					inspector: { port: 0 },
				},
			});

			let res = await worker.fetch("http://dummy");
			await expect(res.text()).resolves.toBe("body:1");

			await helper.seed({
				"src/index.ts": script.replace("body:1", "body:2"),
			});
			await setTimeout(300);

			res = await worker.fetch("http://dummy");
			await expect(res.text()).resolves.toBe("body:2");
		});

		it("InspectorProxyWorker discovery endpoints + devtools websocket connection", async (t) => {
			t.onTestFinished(() => worker?.dispose());

			const script = dedent`
			export default {
				fetch() {
					console.log('Inside mock user worker');

					return new Response("body:1");
				}
			}
		`;

			await helper.seed({
				"src/index.ts": script,
			});

			const worker = await startWorker({
				name: "test-worker",
				entrypoint: path.resolve(helper.tmpPath, "src/index.ts"),

				dev: {
					remote,
					server: { port: 0 },
					inspector: { port: 0 },
				},
			});

			const inspectorUrl = await worker.inspectorUrl;
			assert(inspectorUrl, "missing inspectorUrl");
			const res = await undici.fetch(`http://${inspectorUrl.host}/json`);

			await expect(res.json()).resolves.toBeInstanceOf(Array);

			assert(inspectorUrl, "missing inspectorUrl");
			const ws = new WebSocket(inspectorUrl.href);
			const openPromise = events.once(ws, "open");

			const consoleApiMessages: DevToolsEvent<"Runtime.consoleAPICalled">[] =
				collectMessagesContaining(ws, "Runtime.consoleAPICalled");
			const executionContextCreatedPromise = waitForMessageContaining(
				ws,
				"Runtime.executionContextCreated"
			);

			await openPromise;
			await worker.fetch("http://dummy");

			await expect(executionContextCreatedPromise).resolves.toMatchObject({
				method: "Runtime.executionContextCreated",
				params: {
					context: { id: expect.any(Number) },
				},
			});
			await vi.waitFor(
				() => {
					expect(consoleApiMessages).toContainMatchingObject({
						method: "Runtime.consoleAPICalled",
						params: expect.objectContaining({
							args: [{ type: "string", value: "Inside mock user worker" }],
						}),
					});
				},
				{ timeout: 5_000 }
			);

			// Ensure execution contexts cleared on reload
			const executionContextClearedPromise = waitForMessageContaining(
				ws,
				"Runtime.executionContextsCleared"
			);
			await helper.seed({
				"src/index.ts": script.replace("body:1", "body:2"),
			});
			await setTimeout(300);

			await executionContextClearedPromise;
		});

		it("InspectorProxyWorker rejects unauthorised requests", async (t) => {
			t.onTestFinished(() => worker?.dispose());

			await helper.seed({
				"src/index.ts": dedent`
				export default {
					fetch() {
						return new Response("body:1");
					}
				}
			`,
			});

			const worker = await startWorker({
				name: "test-worker",
				entrypoint: path.resolve(helper.tmpPath, "src/index.ts"),

				dev: {
					remote,
					server: { port: 0 },
					inspector: { port: 0 },
				},
			});

			const inspectorUrl = await worker.inspectorUrl;
			assert(inspectorUrl);

			assert(inspectorUrl, "missing inspectorUrl");
			let ws = new WebSocket(inspectorUrl.href, {
				setHost: false,
				headers: { Host: "example.com" },
			});

			let openPromise = events.once(ws, "open");
			await expect(openPromise).rejects.toThrow("Unexpected server response");

			// Check validates `Origin` header
			assert(inspectorUrl, "missing inspectorUrl");
			ws = new WebSocket(inspectorUrl.href, { origin: "https://example.com" });
			openPromise = events.once(ws, "open");
			await expect(openPromise).rejects.toThrow("Unexpected server response");
			ws.close();
		});

		// Regression test for https://github.com/cloudflare/workers-sdk/issues/5297
		// The runtime inspector can send messages larger than 1MB limit websocket message permitted by UserWorkers.
		// In the real-world, this is encountered when debugging large source files (source maps)
		// or inspecting a variable that serializes to a large string.
		// Connecting devtools directly to the inspector would work fine, but we proxy the inspector messages
		// through a worker (InspectorProxyWorker) which hits the limit (without the fix, compatibilityFlags:["increase_websocket_message_size"])
		// By logging a large string we can verify that the inspector messages are being proxied successfully.
		it("InspectorProxyWorker can proxy messages > 1MB", async (t) => {
			const consoleInfoSpy = vi
				.spyOn(console, "info")
				.mockImplementation(() => {});
			const consoleLogSpy = vi
				.spyOn(console, "log")
				.mockImplementation(() => {});

			t.onTestFinished(() => {
				consoleInfoSpy.mockRestore();
				consoleLogSpy.mockRestore();
				return worker?.dispose();
			});

			const LARGE_STRING = "This is a large string" + "z".repeat(2 ** 20);

			const script = dedent`
			export default {
				fetch() {
					console.log("${LARGE_STRING}");

					return new Response("body:1");
				}
			}
		`;

			await helper.seed({
				"src/index.ts": script,
			});

			const worker = await startWorker({
				name: "test-worker",
				entrypoint: path.resolve(helper.tmpPath, "src/index.ts"),

				dev: {
					remote,
					server: { port: 0 },
					inspector: { port: 0 },
				},
			});

			const inspectorUrl = await worker.inspectorUrl;
			assert(inspectorUrl, "missing inspectorUrl");
			const ws = new WebSocket(inspectorUrl.href);

			const consoleApiMessages: DevToolsEvent<"Runtime.consoleAPICalled">[] =
				collectMessagesContaining(ws, "Runtime.consoleAPICalled");

			await worker.fetch("http://dummy");

			await vi.waitFor(
				() => {
					expect(consoleApiMessages).toContainMatchingObject({
						method: "Runtime.consoleAPICalled",
						params: expect.objectContaining({
							args: [{ type: "string", value: LARGE_STRING }],
						}),
					});
				},
				{ timeout: 5_000 }
			);
		});

		it("config.dev.{server,inspector} changes, restart the server instance", async (t) => {
			t.onTestFinished(() => worker?.dispose());

			await helper.seed({
				"src/index.ts": dedent`
				export default {
					fetch() {
						return new Response("body:1");
					}
				}
			`,
			});

			const worker = await startWorker({
				name: "test-worker",
				entrypoint: path.resolve(helper.tmpPath, "src/index.ts"),

				dev: {
					remote,
					server: { port: await getPort() },
					inspector: false,
				},
			});

			let res = await worker.fetch("http://dummy");
			await expect(res.text()).resolves.toBe("body:1");

			const oldPort = worker.config.dev?.server?.port;
			let undiciRes = await undici.fetch(`http://127.0.0.1:${oldPort}`);
			await expect(undiciRes.text()).resolves.toBe("body:1");

			await worker.patchConfig({
				dev: {
					...worker.config.dev,
					remote,
					server: { port: await getPort() /* new port */ },
					inspector: false,
				},
			});
			const newPort = worker.config.dev?.server?.port;

			res = await worker.fetch("http://dummy");
			await expect(res.text()).resolves.toBe("body:1");

			undiciRes = await undici.fetch(`http://127.0.0.1:${newPort}`);
			await expect(undiciRes.text()).resolves.toBe("body:1");

			await expect(
				undici.fetch(`http://127.0.0.1:${oldPort}`)
			).rejects.toThrowError("fetch failed");
		});

		it("liveReload", async (t) => {
			t.onTestFinished(() => worker?.dispose());

			await helper.seed({
				"src/index.ts": dedent`
				export default {
					fetch() {
						return new Response("body:1", {
							headers: { 'Content-Type': 'text/html' }
						});
					}
				}
			`,
			});

			const worker = await startWorker({
				name: "test-worker",
				entrypoint: path.resolve(helper.tmpPath, "src/index.ts"),

				dev: {
					remote,
					liveReload: true,
					server: { port: 0 },
					inspector: { port: 0 },
				},
			});

			const scriptRegex =
				/<script defer type="application\/javascript">([\s\S]*)<\/script>/gm;

			// test liveReload: true inserts live-reload <script> tag when the response Content-Type is html
			let res = await worker.fetch("http://dummy");
			let resText = await res.text();
			expect(resText).toEqual(expect.stringContaining("body:1"));
			expect(resText).toMatch(scriptRegex);
			expect(resText.replace(scriptRegex, "").trim()).toEqual("body:1"); // test, without the <script> tag, the response is as authored
			expect(resText.match(scriptRegex)?.[0]).toBe(dedent`
			<script defer type="application/javascript">
				(function() {
					var ws;
					function recover() {
						ws = null;
						setTimeout(initLiveReload, 100);
					}
					function initLiveReload() {
						if (ws) return;
						var origin = (location.protocol === "http:" ? "ws://" : "wss://") + location.host;
						ws = new WebSocket(origin + "/cdn-cgi/live-reload", "WRANGLER_PROXYWORKER_LIVE_RELOAD_PROTOCOL");
						ws.onclose = recover;
						ws.onerror = recover;
						ws.onmessage = location.reload.bind(location);
					}
					initLiveReload();
				})();
			</script>
		`);

			await helper.seed({
				"src/index.ts": dedent`
				export default {
					fetch() {
						return new Response("body:2");
					}
				}
			`,
			});
			await setTimeout(300);

			// test liveReload does nothing when the response Content-Type is not html
			res = await worker.fetch("http://dummy");
			resText = await res.text();
			expect(resText).toBe("body:2");
			expect(resText).not.toEqual(expect.stringMatching(scriptRegex));

			await helper.seed({
				"src/index.ts": dedent`
				export default {
					fetch() {
						return new Response("body:3", {
							headers: { 'Content-Type': 'text/html' }
						});
					}
				}
			`,
			});
			await worker.patchConfig({
				dev: {
					...worker.config.dev,
					liveReload: false,
				},
			});

			// test liveReload: false does nothing even when the response Content-Type is html
			res = await worker.fetch("http://dummy");
			resText = await res.text();
			expect(resText).toBe("body:3");
			expect(resText).not.toEqual(expect.stringMatching(scriptRegex));
		});
	});

	describe("DevEnv (local-only)", () => {
		it("User worker exception", async (t) => {
			t.onTestFinished(() => worker?.dispose());

			await helper.seed({
				"src/index.ts": dedent`
					export default {
						fetch() {
							throw new Error('Boom!');
						}
					}
				`,
			});

			const worker = await startWorker({
				name: "test-worker",
				entrypoint: path.resolve(helper.tmpPath, "src/index.ts"),
				dev: {
					server: { port: 0 },
					inspector: { port: 0 },
				},
			});

			await expect(worker.fetch("http://dummy")).rejects.toThrowError("Boom!");

			await helper.seed({
				"src/index.ts": dedent`
					export default {
						fetch() {
							throw new Error('Boom 2!');
						}
					}
				`,
			});
			await setTimeout(300);

			await expect(worker.fetch("http://dummy")).rejects.toThrowError(
				"Boom 2!"
			);

			// test eyeball requests receive the pretty error page
			await helper.seed({
				"src/index.ts": dedent`
					export default {
						fetch() {
							const e = new Error('Boom 3!');

							// this is how errors are serialised after they are caught by wrangler/miniflare3 middlewares
							const error = { name: e.name, message: e.message, stack: e.stack };
							return Response.json(error, {
								status: 500,
								headers: { "MF-Experimental-Error-Stack": "true" },
							});
						}
					}
				`,
			});
			await setTimeout(300);

			const undiciRes = await undici.fetch(await worker.url, {
				headers: { Accept: "text/html" },
			});
			await expect(undiciRes.text()).resolves.toEqual(
				expect.stringContaining(`<span>Boom 3!</span>`) // pretty error page html snippet
			);

			// test further changes that fix the code
			await helper.seed({
				"src/index.ts": dedent`
				export default {
					fetch() {
						return new Response("body:3");
					}
				}
			`,
			});
			await setTimeout(300);

			let res = await worker.fetch("http://dummy");
			await expect(res.text()).resolves.toBe("body:3");

			res = await worker.fetch("http://dummy");
			await expect(res.text()).resolves.toBe("body:3");
		});

		it("origin override takes effect in the UserWorker", async (t) => {
			t.onTestFinished(() => worker?.dispose());

			await helper.seed({
				"src/index.ts": dedent`
					export default {
						fetch(request) {
							return new Response("URL: " + request.url);
						}
					}
				`,
			});

			const worker = await startWorker({
				name: "test-worker",
				entrypoint: path.resolve(helper.tmpPath, "src/index.ts"),

				dev: {
					origin: {
						hostname: "www.google.com",
					},
					server: { port: 0 },
					inspector: { port: 0 },
				},
			});

			let res = await worker.fetch("http://dummy/test/path/1");
			await expect(res.text()).resolves.toBe(
				`URL: http://www.google.com/test/path/1`
			);

			await worker.patchConfig({
				dev: {
					...worker.config.dev,
					origin: {
						secure: true,
						hostname: "mybank.co.uk",
					},
				},
			});

			res = await worker.fetch("http://dummy/test/path/2");
			await expect(res.text()).resolves.toBe(
				"URL: https://mybank.co.uk/test/path/2"
			);
		});

		it("inflight requests are retried during UserWorker reloads", async (t) => {
			// to simulate inflight requests failing during UserWorker reloads,
			// we will use a UserWorker with a longish `await setTimeout(...)`
			// so that we can guarantee the race condition is hit when workerd is eventually terminated
			// this does not apply to remote workers as they are not terminated during reloads

			t.onTestFinished(() => worker?.dispose());

			const script = dedent`
				export default {
					async fetch(request) {
						const url = new URL(request.url);

						if (url.pathname === '/long') {
							await new Promise(r => setTimeout(r, 30_000));
						}

						return new Response("UserWorker:1");
					}
				}
			`;

			await helper.seed({
				"src/index.ts": script,
			});

			const worker = await startWorker({
				name: "test-worker",
				entrypoint: path.resolve(helper.tmpPath, "src/index.ts"),
				dev: {
					server: { port: 0 },
					inspector: { port: 0 },
				},
			});

			let res = await worker.fetch("http://dummy/short");
			await expect(res.text()).resolves.toBe("UserWorker:1");

			const inflightDuringReloads = worker.fetch("http://dummy/long"); // NOTE: no await

			// this will cause workerd for UserWorker:1 to terminate (eventually, but soon)
			await helper.seed({
				"src/index.ts": script.replace("UserWorker:1", "UserWorker:2"),
			});
			await setTimeout(300);

			res = await worker.fetch("http://dummy/short");
			await expect(res.text()).resolves.toBe("UserWorker:2");

			// this will cause workerd for UserWorker:2 to terminate (eventually, but soon)
			await helper.seed({
				"src/index.ts": script
					.replace("UserWorker:1", "UserWorker:3") // change response so it can be identified
					.replace("30_000", "0"), // remove the long wait as we won't reload this UserWorker
			});

			res = await inflightDuringReloads;
			await expect(res.text()).resolves.toBe("UserWorker:3");
		});

		it("vars from .env (next to config file) override vars from Wrangler config file", async (t) => {
			t.onTestFinished(() => worker?.dispose());
			await helper.seed({
				"src/index.ts": dedent`
					export default {
						fetch(request, env) {
							return Response.json(env);
						}
					}
				`,
				"wrangler.jsonc": JSON.stringify({
					vars: {
						WRANGLER_ENV_VAR_0: "default-0",
						WRANGLER_ENV_VAR_1: "default-1",
						WRANGLER_ENV_VAR_2: "default-2",
						WRANGLER_ENV_VAR_3: "default-3",
					},
				}),
				".env": dedent`
					WRANGLER_ENV_VAR_1=env-1
					WRANGLER_ENV_VAR_2=env-2
				`,
				".env.local": dedent`
					WRANGLER_ENV_VAR_2=local-2
					WRANGLER_ENV_VAR_3=local-3
				`,
				".env.staging": dedent`
					WRANGLER_ENV_VAR_3=staging-3
					WRANGLER_ENV_VAR_4=staging-4
				`,
				".env.staging.local": dedent`
					WRANGLER_ENV_VAR_4=staging-local-4
					WRANGLER_ENV_VAR_5=staging-local-5
				`,
			});

			const worker = await startWorker({
				config: path.resolve(helper.tmpPath, "wrangler.jsonc"),
				name: "test-worker",
				entrypoint: path.resolve(helper.tmpPath, "src/index.ts"),
				dev: {
					server: { port: 0 },
					inspector: { port: 0 },
				},
			});

			const res = await worker.fetch("http://dummy/test/path/1");
			expect(await res.json()).toMatchInlineSnapshot(`
				{
				  "WRANGLER_ENV_VAR_0": "default-0",
				  "WRANGLER_ENV_VAR_1": "env-1",
				  "WRANGLER_ENV_VAR_2": "local-2",
				  "WRANGLER_ENV_VAR_3": "local-3",
				}
			`);
		});

		it("vars are not loaded from .env if there is a .dev.vars file (next to config file)", async (t) => {
			t.onTestFinished(() => worker?.dispose());
			await helper.seed({
				"src/index.ts": dedent`
					export default {
						fetch(request, env) {
							return Response.json(env);
						}
					}
				`,
				"wrangler.jsonc": JSON.stringify({
					vars: {
						WRANGLER_ENV_VAR_0: "default-0",
						WRANGLER_ENV_VAR_1: "default-1",
						WRANGLER_ENV_VAR_2: "default-2",
						WRANGLER_ENV_VAR_3: "default-3",
					},
				}),
				".env": dedent`
					WRANGLER_ENV_VAR_1=env-1
					WRANGLER_ENV_VAR_2=env-2
				`,
				".dev.vars": dedent`
					WRANGLER_ENV_VAR_2=dev-vars-2
					WRANGLER_ENV_VAR_3=dev-vars-3
				`,
			});

			const worker = await startWorker({
				config: path.resolve(helper.tmpPath, "wrangler.jsonc"),
				name: "test-worker",
				entrypoint: path.resolve(helper.tmpPath, "src/index.ts"),
				dev: {
					server: { port: 0 },
					inspector: { port: 0 },
				},
			});

			const res = await worker.fetch("http://dummy/test/path/1");
			expect(await res.json()).toMatchInlineSnapshot(`
				{
				  "WRANGLER_ENV_VAR_0": "default-0",
				  "WRANGLER_ENV_VAR_1": "default-1",
				  "WRANGLER_ENV_VAR_2": "dev-vars-2",
				  "WRANGLER_ENV_VAR_3": "dev-vars-3",
				}
			`);
		});

		it("vars from inline config override vars from both .env and config file", async (t) => {
			t.onTestFinished(() => worker?.dispose());
			await helper.seed({
				"src/index.ts": dedent`
					export default {
						fetch(request, env) {
							return Response.json(env);
						}
					}
				`,
				"wrangler.jsonc": JSON.stringify({
					vars: {
						WRANGLER_ENV_VAR_0: "default-0",
						WRANGLER_ENV_VAR_1: "default-1",
						WRANGLER_ENV_VAR_2: "default-2",
						WRANGLER_ENV_VAR_3: "default-3",
					},
				}),
				".env": dedent`
					WRANGLER_ENV_VAR_1=env-1
					WRANGLER_ENV_VAR_2=env-2
				`,
				".env.local": dedent`
					WRANGLER_ENV_VAR_2=local-2
					WRANGLER_ENV_VAR_3=local-3
				`,
				".env.staging": dedent`
					WRANGLER_ENV_VAR_3=staging-3
					WRANGLER_ENV_VAR_4=staging-4
				`,
				".env.staging.local": dedent`
					WRANGLER_ENV_VAR_4=staging-local-4
					WRANGLER_ENV_VAR_5=staging-local-5
				`,
			});

			const worker = await startWorker({
				config: path.resolve(helper.tmpPath, "wrangler.jsonc"),
				name: "test-worker",
				entrypoint: path.resolve(helper.tmpPath, "src/index.ts"),
				bindings: {
					WRANGLER_ENV_VAR_3: { type: "plain_text", value: "inline-3" },
					WRANGLER_ENV_VAR_4: { type: "plain_text", value: "inline-4" },
				},
				dev: {
					server: { port: 0 },
					inspector: { port: 0 },
				},
			});

			const res = await worker.fetch("http://dummy/test/path/1");
			expect(await res.json()).toMatchInlineSnapshot(`
				{
				  "WRANGLER_ENV_VAR_0": "default-0",
				  "WRANGLER_ENV_VAR_1": "env-1",
				  "WRANGLER_ENV_VAR_2": "local-2",
				  "WRANGLER_ENV_VAR_3": "inline-3",
				  "WRANGLER_ENV_VAR_4": "inline-4",
				}
			`);
		});

		it("vars from .env pointed at by `envFile` override vars from Wrangler config file and .env files local to the config file", async (t) => {
			t.onTestFinished(() => worker?.dispose());
			await helper.seed({
				"src/index.ts": dedent`
					export default {
						fetch(request, env) {
							return Response.json(env);
						}
					}
				`,
				"wrangler.jsonc": JSON.stringify({
					vars: {
						WRANGLER_ENV_VAR_0: "default-0",
						WRANGLER_ENV_VAR_1: "default-1",
						WRANGLER_ENV_VAR_2: "default-2",
						WRANGLER_ENV_VAR_3: "default-3",
					},
				}),
				".env": dedent`
					WRANGLER_ENV_VAR_1=env-1
					WRANGLER_ENV_VAR_2=env-2
				`,
				".env.local": dedent`
					WRANGLER_ENV_VAR_2=local-2
					WRANGLER_ENV_VAR_3=local-3
				`,
				"other/.env": dedent`
					WRANGLER_ENV_VAR_3=other-3
					WRANGLER_ENV_VAR_4=other-4
				`,
				"other/.env.local": dedent`
					WRANGLER_ENV_VAR_4=other-local-4
					WRANGLER_ENV_VAR_5=other-local-5
				`,
			});

			const worker = await startWorker({
				config: path.resolve(helper.tmpPath, "wrangler.jsonc"),
				name: "test-worker",
				entrypoint: path.resolve(helper.tmpPath, "src/index.ts"),
				envFiles: ["other/.env", "other/.env.local"],
				dev: {
					server: { port: 0 },
					inspector: { port: 0 },
				},
			});

			const res = await worker.fetch("http://dummy/test/path/1");
			expect(await res.json()).toMatchInlineSnapshot(`
				{
				  "WRANGLER_ENV_VAR_0": "default-0",
				  "WRANGLER_ENV_VAR_1": "default-1",
				  "WRANGLER_ENV_VAR_2": "default-2",
				  "WRANGLER_ENV_VAR_3": "other-3",
				  "WRANGLER_ENV_VAR_4": "other-local-4",
				  "WRANGLER_ENV_VAR_5": "other-local-5",
				}
			`);
		});
	});
});
