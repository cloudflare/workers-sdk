import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import dedent from "ts-dedent";
import { beforeEach, describe, it, onTestFinished, vi } from "vitest";
import {
	importWrangler,
	WranglerE2ETestHelper,
} from "./helpers/e2e-wrangler-test";

const { createServer } = await importWrangler();

describe("createServer", { sequential: true }, () => {
	let helper: WranglerE2ETestHelper;

	beforeEach(() => {
		helper = new WranglerE2ETestHelper();
	});

	it("starts with default server options", async ({ expect }) => {
		await helper.seed({
			"wrangler.jsonc": dedent`
				{
					"name": "hello-worker",
					"main": "src/index.ts",
					"compatibility_date": "2026-05-20"
				}
			`,
			"src/index.ts": dedent`
				export default {
					fetch(request) {
						if (new URL(request.url).pathname === "/url") {
							return new Response(request.url);
						}
						return new Response("Hello World");
					}
				};
			`,
		});

		const server = createServer({
			workers: [
				{ configPath: path.resolve(helper.tmpPath, "./wrangler.jsonc") },
			],
		});
		onTestFinished(server.close);

		const { url, inspectorUrl } = await server.listen();

		expect(url.protocol).toBe("http:");
		expect(url.hostname).toBe("127.0.0.1");
		expect(Number(url.port)).toBeGreaterThan(0);
		expect(inspectorUrl).toBeUndefined();

		const response1 = await fetch(url);
		await expect(response1.text()).resolves.toBe("Hello World");

		const relativeServerResponse = await server.fetch("/url");
		await expect(relativeServerResponse.text()).resolves.toBe(
			new URL("/url", url).href
		);

		const relativeWorkerResponse = await server.getWorker().fetch("/url");
		await expect(relativeWorkerResponse.text()).resolves.toBe(
			new URL("/url", url).href
		);
	});

	it("support fetching different workers from the same session", async ({
		expect,
	}) => {
		await helper.seed({
			"wrangler.primary.jsonc": dedent`
				{
					"name": "primary-worker",
					"main": "src/primary.ts",
					"compatibility_date": "2026-05-20"
				}
			`,
			"wrangler.auxiliary.jsonc": dedent`
				{
					"name": "auxiliary-worker",
					"main": "src/auxiliary.ts",
					"compatibility_date": "2026-05-20"
				}
			`,
			"src/primary.ts": dedent`
				export default {
					fetch() {
						return new Response("Hello from Primary Worker");
					}
				};
			`,
			"src/auxiliary.ts": dedent`
				export default {
					fetch() {
						return new Response("Hello from Auxiliary Worker");
					}
				};
			`,
		});

		const server = createServer({
			root: helper.tmpPath,
			workers: [
				{ configPath: "./wrangler.primary.jsonc" },
				{ configPath: "./wrangler.auxiliary.jsonc" },
			],
		});
		onTestFinished(server.close);

		await server.listen();

		const defaultServerResponse = await server.fetch("/");
		await expect(defaultServerResponse.text()).resolves.toBe(
			"Hello from Primary Worker"
		);

		const defaultWorkerResponse = await server.getWorker().fetch("/");
		await expect(defaultWorkerResponse.text()).resolves.toBe(
			"Hello from Primary Worker"
		);

		const primaryResponse = await server.getWorker("primary-worker").fetch("/");
		await expect(primaryResponse.text()).resolves.toBe(
			"Hello from Primary Worker"
		);

		const auxiliaryResponse = await server
			.getWorker("auxiliary-worker")
			.fetch("/");
		await expect(auxiliaryResponse.text()).resolves.toBe(
			"Hello from Auxiliary Worker"
		);
	});

	it("routes fetches based on worker routes", async ({ expect }) => {
		await helper.seed({
			"wrangler.primary.jsonc": dedent`
				{
					"name": "primary-worker",
					"main": "src/primary.ts",
					"compatibility_date": "2026-05-20",
					"routes": ["primary.example.com/*"]
				}
			`,
			"src/primary.ts": dedent`
				export default {
					fetch(request) {
						return Response.json({ name: "primary", url: request.url });
					}
				};
			`,
			"src/auxiliary.ts": dedent`
				export default {
					fetch(request) {
						return Response.json({ name: "auxiliary", url: request.url });
					}
				};
			`,
		});

		const server = createServer({
			root: helper.tmpPath,
			workers: [
				{ configPath: "./wrangler.primary.jsonc" },
				{
					config: {
						name: "auxiliary-worker",
						main: "src/auxiliary.ts",
						compatibility_date: "2026-05-20",
						routes: ["auxiliary.example.com/*"],
					},
				},
			],
		});
		onTestFinished(server.close);

		await server.listen();

		const primaryResponse = await server.fetch(
			"http://primary.example.com/path?value=1"
		);
		await expect(primaryResponse.json()).resolves.toEqual({
			name: "primary",
			url: "http://primary.example.com/path?value=1",
		});

		const auxiliaryResponse = await server.fetch(
			"http://auxiliary.example.com/path?value=2"
		);
		await expect(auxiliaryResponse.json()).resolves.toEqual({
			name: "auxiliary",
			url: "http://auxiliary.example.com/path?value=2",
		});

		await server.update({
			root: helper.tmpPath,
			workers: [
				{ configPath: "./wrangler.primary.jsonc" },
				{
					config: {
						name: "auxiliary-worker",
						main: "src/auxiliary.ts",
						compatibility_date: "2026-05-20",
						routes: ["updated-auxiliary.example.com/*"],
					},
				},
			],
		});

		const updatedAuxiliaryResponse = await server.fetch(
			"http://updated-auxiliary.example.com/path?value=3"
		);
		await expect(updatedAuxiliaryResponse.json()).resolves.toEqual({
			name: "auxiliary",
			url: "http://updated-auxiliary.example.com/path?value=3",
		});
	});

	it("rejects updates that change the number of workers", async ({
		expect,
	}) => {
		await helper.seed({
			"src/primary.ts": dedent`
				export default {
					fetch() {
						return new Response("primary");
					}
				};
			`,
			"src/auxiliary.ts": dedent`
				export default {
					fetch() {
						return new Response("auxiliary");
					}
				};
			`,
		});

		const server = createServer({
			root: helper.tmpPath,
			workers: [
				{
					config: {
						name: "primary-worker",
						main: "src/primary.ts",
						compatibility_date: "2026-05-20",
					},
				},
			],
		});
		onTestFinished(server.close);

		await server.listen();

		await expect(
			server.update((options) => ({
				...options,
				workers: [
					...options.workers,
					{
						config: {
							name: "auxiliary-worker",
							main: "src/auxiliary.ts",
							compatibility_date: "2026-05-20",
						},
					},
				],
			}))
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Updating the number of workers running in the server is not supported.]`
		);
	});

	it("returns a 404 response for missing workers", async ({ expect }) => {
		await helper.seed({
			"wrangler.jsonc": dedent`
				{
					"name": "primary-worker",
					"main": "src/index.ts",
					"compatibility_date": "2026-05-20"
				}
			`,
			"src/index.ts": dedent`
				export default {
					fetch() {
						return new Response("primary");
					}
				};
			`,
		});

		const server = createServer({
			root: helper.tmpPath,
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
		onTestFinished(server.close);

		await server.listen();

		const response = await server.getWorker("missing-worker").fetch("/");
		expect(response.status).toBe(404);
		await expect(response.text()).resolves.toBe("No entrypoint worker found");
	});

	it("supports overriding fetch for outbound requests", async ({ expect }) => {
		await helper.seed({
			"wrangler.jsonc": dedent`
				{
					"name": "hello-example",
					"main": "src/index.ts",
					"compatibility_date": "2026-05-20"
				}
			`,
			"src/index.ts": dedent`
				export default {
					fetch() {
						return fetch("http://example.com");
					}
				};
			`,
		});

		const server = createServer({
			root: helper.tmpPath,
			workers: [{ configPath: "./wrangler.jsonc" }],
			outboundService(request) {
				if (request.url === "http://example.com/") {
					return new Response("Mocked response from example.com");
				}

				throw new Error(`Unexpected outbound request to ${request.url}`);
			},
		});
		onTestFinished(server.close);

		await server.listen();

		const response = await server.fetch("/");
		await expect(response.text()).resolves.toBe(
			"Mocked response from example.com"
		);
	});

	it("uses the current Node process fetch for outbound requests by default", async ({
		expect,
	}) => {
		const mockServer = setupServer(
			http.get("http://example.com/", () => {
				return HttpResponse.text("Mocked by MSW");
			})
		);
		mockServer.listen({ onUnhandledRequest: "error" });
		onTestFinished(() => mockServer.close());

		await helper.seed({
			"wrangler.jsonc": dedent`
				{
					"name": "default-outbound-worker",
					"main": "src/index.ts",
					"compatibility_date": "2026-05-20"
				}
			`,
			"src/index.ts": dedent`
				export default {
					fetch() {
						return fetch("http://example.com");
					}
				};
			`,
		});

		const server = createServer({
			root: helper.tmpPath,
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
		onTestFinished(server.close);

		await server.listen();

		const response = await server.fetch("/");
		await expect(response.text()).resolves.toBe("Mocked by MSW");
	});

	it("starts workers from inline config", async ({ expect }) => {
		await helper.seed({
			"src/index.ts": dedent`
				export default {
					fetch() {
						return new Response("Hello from inline config");
					}
				};
			`,
		});

		const server = createServer({
			workers: [
				{
					root: helper.tmpPath,
					config: {
						main: "src/index.ts",
						compatibility_date: "2026-05-20",
					},
				},
			],
		});
		onTestFinished(server.close);

		await server.listen();

		const response = await server.fetch("/");
		await expect(response.text()).resolves.toBe("Hello from inline config");
	});

	it("loads default .env files for config path workers", async ({ expect }) => {
		await helper.seed({
			"wrangler.jsonc": dedent`
				{
					"name": "env-worker",
					"main": "src/index.ts",
					"compatibility_date": "2026-05-20",
					"vars": { "CONFIG_VAR": "from-config" }
				}
			`,
			".env": dedent`
				ENV_SECRET=from-env
			`,
			"src/index.ts": dedent`
				export default {
					fetch(request, env) {
						return Response.json({
							CONFIG_VAR: env.CONFIG_VAR,
							ENV_SECRET: env.ENV_SECRET,
						});
					}
				};
			`,
		});

		const server = createServer({
			root: helper.tmpPath,
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
		onTestFinished(server.close);

		await server.listen();

		const response = await server.fetch("/");
		await expect(response.json()).resolves.toEqual({
			CONFIG_VAR: "from-config",
			ENV_SECRET: "from-env",
		});
	});

	it("loads default .dev.vars files for config path workers", async ({
		expect,
	}) => {
		await helper.seed({
			"wrangler.jsonc": dedent`
				{
					"name": "dev-vars-worker",
					"main": "src/index.ts",
					"compatibility_date": "2026-05-20",
					"vars": { "CONFIG_VAR": "from-config" }
				}
			`,
			".env": dedent`
				SECRET=from-env
			`,
			".dev.vars": dedent`
				SECRET=from-dev-vars
			`,
			"src/index.ts": dedent`
				export default {
					fetch(request, env) {
						return Response.json({
							CONFIG_VAR: env.CONFIG_VAR,
							SECRET: env.SECRET,
						});
					}
				};
			`,
		});

		const server = createServer({
			root: helper.tmpPath,
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
		onTestFinished(server.close);

		await server.listen();

		const response = await server.fetch("/");
		await expect(response.json()).resolves.toEqual({
			CONFIG_VAR: "from-config",
			SECRET: "from-dev-vars",
		});
	});

	it("overrides vars and secrets for config path workers", async ({
		expect,
	}) => {
		await helper.seed({
			"wrangler.jsonc": dedent`
				{
					"name": "var-overrides-worker",
					"main": "src/index.ts",
					"compatibility_date": "2026-05-20",
					"vars": { "CONFIG_VAR": "from-config" },
					"secrets": { "required": ["API_TOKEN", "SECRET_FROM_FILE"] }
				}
			`,
			".dev.vars": dedent`
				API_TOKEN=from-dev-vars
				SECRET_FROM_FILE=from-dev-vars
			`,
			"src/index.ts": dedent`
				export default {
					fetch(request, env) {
						return Response.json({
							CONFIG_VAR: env.CONFIG_VAR,
							API_TOKEN: env.API_TOKEN,
							SECRET_FROM_FILE: env.SECRET_FROM_FILE,
							ADDED_VAR: env.ADDED_VAR,
							NULL_VAR: env.NULL_VAR,
						});
					}
				};
			`,
		});

		const server = createServer({
			root: helper.tmpPath,
			workers: [
				{
					configPath: "./wrangler.jsonc",
					overrides: {
						vars: {
							CONFIG_VAR: "from-override",
							ADDED_VAR: "from-override",
							NULL_VAR: null,
						},
						secrets: {
							API_TOKEN: "from-override",
						},
					},
				},
			],
		});
		onTestFinished(server.close);

		await server.listen();

		const response = await server.fetch("/");
		await expect(response.json()).resolves.toEqual({
			CONFIG_VAR: "from-override",
			API_TOKEN: "from-override",
			SECRET_FROM_FILE: "from-dev-vars",
			ADDED_VAR: "from-override",
			NULL_VAR: null,
		});

		await server.update({
			root: helper.tmpPath,
			workers: [
				{
					configPath: "./wrangler.jsonc",
					overrides: {
						vars: {
							CONFIG_VAR: "from-updated-override",
							ADDED_VAR: "from-updated-override",
							NULL_VAR: null,
						},
						secrets: {
							API_TOKEN: "from-updated-override",
						},
					},
				},
			],
		});

		const updatedResponse = await server.fetch("/");
		await expect(updatedResponse.json()).resolves.toEqual({
			CONFIG_VAR: "from-updated-override",
			API_TOKEN: "from-updated-override",
			SECRET_FROM_FILE: "from-dev-vars",
			ADDED_VAR: "from-updated-override",
			NULL_VAR: null,
		});
	});

	it(`supports "nodejs_compat" flag`, async ({ expect }) => {
		await helper.seed({
			"wrangler.jsonc": dedent`
				{
					"name": "nodejs-compat-worker",
					"main": "src/index.ts",
					"compatibility_date": "2026-05-20",
					"compatibility_flags": ["nodejs_compat"]
				}
			`,
			"src/index.ts": dedent`
				import { Stream } from "node:stream";

				export default {
					fetch() {
						return new Response(String(typeof Stream));
					}
				};
			`,
		});

		const server = createServer({
			root: helper.tmpPath,
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
		onTestFinished(server.close);

		await server.listen();

		const response = await server.fetch("/");
		await expect(response.text()).resolves.toBe("function");
	});

	it("supports Workers Sites", async ({ expect }) => {
		await helper.seed({
			"public/hello.txt": "Hello from Workers Sites",
			"src/index.ts": dedent`
				import manifestJSON from "__STATIC_CONTENT_MANIFEST";

				const manifest = JSON.parse(manifestJSON);

				export default {
					async fetch(request, env) {
						const key = manifest[new URL(request.url).pathname.slice(1)];
						const value = key ? await env.__STATIC_CONTENT.get(key) : null;
						return new Response(value ?? "missing");
					}
				};
			`,
		});

		const server = createServer({
			root: helper.tmpPath,
			workers: [
				{
					config: {
						main: "src/index.ts",
						compatibility_date: "2026-05-20",
						site: { bucket: "public" },
					},
				},
			],
		});
		onTestFinished(server.close);

		await server.listen();

		const response = await server.fetch("/hello.txt");
		await expect(response.text()).resolves.toBe("Hello from Workers Sites");
	});

	it("uses ephemeral storage by default", async ({ expect }) => {
		await helper.seed({
			"wrangler.jsonc": dedent`
				{
					"name": "ephemeral-storage-worker",
					"main": "src/index.ts",
					"compatibility_date": "2026-05-20",
					"kv_namespaces": [
						{ "binding": "STORE", "id": "test-store" }
					]
				}
			`,
			"src/index.ts": dedent`
				export default {
					async fetch(request, env) {
						const url = new URL(request.url);
						if (url.pathname === "/set") {
							await env.STORE.put("key", "value");
							return new Response("stored");
						}
						return new Response((await env.STORE.get("key")) ?? "missing");
					}
				};
			`,
		});

		const firstServer = createServer({
			root: helper.tmpPath,
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
		onTestFinished(firstServer.close);

		await firstServer.listen();

		const setResponse = await firstServer.fetch("/set");
		await expect(setResponse.text()).resolves.toBe("stored");

		const storedResponse = await firstServer.fetch("/");
		await expect(storedResponse.text()).resolves.toBe("value");

		await firstServer.close();

		const secondServer = createServer({
			root: helper.tmpPath,
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
		onTestFinished(secondServer.close);

		await secondServer.listen();

		const resetResponse = await secondServer.fetch("/");
		await expect(resetResponse.text()).resolves.toBe("missing");
	});

	it("clears local storage", async ({ expect }) => {
		await helper.seed({
			"wrangler.jsonc": dedent`
				{
					"name": "storage-worker",
					"main": "src/index.ts",
					"compatibility_date": "2026-05-20",
					"kv_namespaces": [
						{ "binding": "STORE", "id": "test-store" }
					]
				}
			`,
			"src/index.ts": dedent`
				export default {
					async fetch(request, env) {
						const url = new URL(request.url);
						if (url.pathname === "/set") {
							await env.STORE.put("key", "value");
							return new Response("stored");
						}
						return new Response((await env.STORE.get("key")) ?? "missing");
					}
				};
			`,
		});

		const server = createServer({
			root: helper.tmpPath,
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
		onTestFinished(server.close);

		await expect(server.clearStorage()).rejects.toThrow(
			"Worker server has not been started. Call server.listen()."
		);

		await server.listen();

		const setResponse = await server.fetch("/set");
		await expect(setResponse.text()).resolves.toBe("stored");
		const storedResponse = await server.fetch("/");
		await expect(storedResponse.text()).resolves.toBe("value");
		await server.close();

		const persistentServer = createServer({
			root: helper.tmpPath,
			persist: "state",
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
		onTestFinished(persistentServer.close);

		await persistentServer.listen();
		const persistentSetResponse = await persistentServer.fetch("/set");
		await expect(persistentSetResponse.text()).resolves.toBe("stored");
		await persistentServer.close();

		const nextPersistentServer = createServer({
			root: helper.tmpPath,
			persist: "state",
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
		onTestFinished(nextPersistentServer.close);

		await nextPersistentServer.listen();
		const persistentStoredResponse = await nextPersistentServer.fetch("/");
		await expect(persistentStoredResponse.text()).resolves.toBe("value");

		await nextPersistentServer.clearStorage();

		const persistentClearedResponse = await nextPersistentServer.fetch("/");
		await expect(persistentClearedResponse.text()).resolves.toBe("missing");
		await nextPersistentServer.close();

		const defaultPersistentServer = createServer({
			root: helper.tmpPath,
			persist: true,
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
		onTestFinished(defaultPersistentServer.close);
		await defaultPersistentServer.listen();

		await expect(defaultPersistentServer.clearStorage()).rejects.toThrow(
			"clearStorage() cannot clear storage when persist is true."
		);
	});

	it("uses local bindings by default when local support is available", async ({
		expect,
	}) => {
		await helper.seed({
			"wrangler.jsonc": dedent`
				{
					"name": "write-worker",
					"main": "src/writer.ts",
					"compatibility_date": "2026-05-20",
					"kv_namespaces": [
						{ "binding": "STORE", "id": "store-id", "remote": true }
					]
				}
			`,
			"src/writer.ts": dedent`
				export default {
					async fetch(request, env) {
						await env.STORE.put("key", "value");
						return new Response("Ok");
					}
				};
			`,
			"src/reader.ts": dedent`
				export default {
					async fetch(request, env) {
						return new Response((await env.STORE.get("key")) ?? "missing");
					}
				};
			`,
		});

		const server = createServer({
			root: helper.tmpPath,
			workers: [
				{ configPath: "./wrangler.jsonc" },
				{
					config: {
						name: "read-worker",
						main: "src/reader.ts",
						compatibility_date: "2026-05-20",
						kv_namespaces: [
							{
								binding: "STORE",
								id: "store-id",
								remote: true,
							},
						],
					},
				},
			],
		});
		onTestFinished(server.close);

		await server.listen();

		const writeResponse = await server.getWorker("write-worker").fetch("/");
		await expect(writeResponse.text()).resolves.toBe("Ok");

		const readResponse1 = await server.getWorker("read-worker").fetch("/");
		await expect(readResponse1.text()).resolves.toBe("value");

		await server.clearStorage();

		const readResponse2 = await server.getWorker("read-worker").fetch("/");
		await expect(readResponse2.text()).resolves.toBe("missing");
	});

	it("exposes the inspector URL when enabled", async ({ expect }) => {
		await helper.seed({
			"wrangler.jsonc": dedent`
				{
					"name": "inspector-worker",
					"main": "src/index.ts",
					"compatibility_date": "2026-05-20"
				}
			`,
			"src/index.ts": dedent`
				export default {
					fetch() {
						return new Response("Hello World");
					}
				};
			`,
		});

		const server = createServer({
			root: helper.tmpPath,
			workers: [{ configPath: "./wrangler.jsonc" }],
			inspector: { port: 0 },
		});
		onTestFinished(server.close);

		const { inspectorUrl } = await server.listen();

		expect(inspectorUrl).toBeDefined();
		const inspectorResponse = await fetch(`http://${inspectorUrl?.host}/json`);
		expect(inspectorResponse.ok).toBe(true);
	});

	it("triggers scheduled handlers", async ({ expect }) => {
		await helper.seed({
			"wrangler.jsonc": dedent`
				{
					"name": "scheduled-worker",
					"main": "src/index.ts",
					"compatibility_date": "2026-05-20"
				}
			`,
			"src/index.ts": dedent`
				let lastCron = "missing";

				export default {
					fetch() {
						return new Response(lastCron);
					},
					scheduled(event) {
						lastCron = event.cron;
					}
				};
			`,
		});

		const server = createServer({
			root: helper.tmpPath,
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
		onTestFinished(server.close);

		await server.listen();

		const beforeScheduled = await server.fetch("/");
		await expect(beforeScheduled.text()).resolves.toBe("missing");

		await expect(
			server.getWorker().scheduled({
				cron: "* * * * *",
				scheduledTime: new Date(1_700_000_100_000),
			})
		).resolves.toEqual({ outcome: "ok", noRetry: false });

		const afterScheduled = await server.fetch("/");
		await expect(afterScheduled.text()).resolves.toBe("* * * * *");
	});

	it("does not reload on source changes by default", async ({ expect }) => {
		await helper.seed({
			"wrangler.jsonc": dedent`
				{
					"name": "create-server-test",
					"main": "src/index.ts",
					"compatibility_date": "2026-05-20"
				}
			`,
			"src/index.ts": dedent`
				export default {
					fetch() {
						return new Response("Hello World");
					}
				};
			`,
		});

		const server = createServer({
			root: helper.tmpPath,
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
		onTestFinished(server.close);

		await server.listen();

		const response1 = await server.fetch("/");
		await expect(response1.text()).resolves.toBe("Hello World");

		await helper.seed({
			"src/index.ts": dedent`
				export default {
					fetch() {
						return new Response("Greeting");
					}
				};
			`,
		});

		// Wait a moment to ensure that if the server were going to reload, it would have done so by now
		await setTimeout(1000);

		const response2 = await server.fetch("/");
		await expect(response2.text()).resolves.toBe("Hello World");

		await server.update((options) => ({ ...options, watch: true }));

		const response3 = await server.fetch("/");
		await expect(response3.text()).resolves.toBe("Greeting");

		await helper.seed({
			"src/index.ts": dedent`
				export default {
					fetch() {
						return new Response("Bonjour");
					}
				};
			`,
		});

		await vi.waitFor(async () => {
			const response4 = await server.fetch("/");
			expect(await response4.text()).toBe("Bonjour");
		});
	});
});
