import { setTimeout } from "node:timers/promises";
import { maybeStartOrUpdateRemoteProxySession } from "@cloudflare/remote-bindings";
import {
	mockConsoleMethods,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, onTestFinished, vi } from "vitest";
import { createTestHarness } from "../index";
import type { TestHarnessOptions } from "../index";
import type {
	CloudflareWorkersModule,
	D1Database,
	DurableObjectNamespace,
	KVNamespace,
	R2Bucket,
} from "@cloudflare/workers-types";

// Starting a real session needs Cloudflare credentials
vi.mock("@cloudflare/remote-bindings", () => ({
	maybeStartOrUpdateRemoteProxySession: vi.fn(),
}));

type BuildWorker = {
	config: Record<string, unknown>;
	script?: string;
	assets?: Record<string, string>;
};

/**
 * Writes a project's Build Output, as a build tool would.
 *
 * @param projectDir The project directory
 * @param workers The Workers, keyed by their directory under `workers/`
 * @param mode The mode the build ran in
 */
async function writeBuild(
	projectDir: string,
	workers: Record<string, BuildWorker>,
	mode = "production"
) {
	const outputDir = `${projectDir}/.cloudflare/output/v0`;
	const files: Record<string, string> = {
		[`${outputDir}/config.json`]: JSON.stringify({
			buildContext: { isPreview: false, mode },
		}),
	};
	for (const [directoryName, worker] of Object.entries(workers)) {
		const workerDir = `${outputDir}/workers/${directoryName}`;
		files[`${workerDir}/worker.config.json`] = JSON.stringify({
			compatibilityDate: "2026-10-01",
			...worker.config,
			manifest:
				worker.script === undefined
					? undefined
					: { type: "partial", mainModule: "index.js", modules: {} },
		});
		if (worker.script !== undefined) {
			files[`${workerDir}/bundle/index.js`] = worker.script;
		}
		for (const [name, contents] of Object.entries(worker.assets ?? {})) {
			files[`${workerDir}/assets/${name}`] = contents;
		}
	}
	await seed(files);
}

/**
 * Creates a test harness that's closed when the test finishes.
 *
 * @param options The harness's options
 * @returns The test harness
 */
function useTestHarness(options: TestHarnessOptions) {
	const harness = createTestHarness(options);
	onTestFinished(() => harness.close());
	return harness;
}

describe("createTestHarness()", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	beforeEach(() => {
		vi.mocked(maybeStartOrUpdateRemoteProxySession).mockResolvedValue(null);
	});

	function normalizeDebugOutput(output: string) {
		return String(output)
			.replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/gm, "<timestamp>")
			.replace(/http:\/\/127\.0\.0\.1:\d+/g, "http://127.0.0.1:<port>");
	}

	it("runs a build's default Worker and its assets", async ({ expect }) => {
		await writeBuild("app", {
			default: {
				config: {
					name: "app",
					env: { GREETING: { type: "text", value: "Hello" } },
				},
				script: `export default {
					fetch(request, env) {
						return new Response(env.GREETING + " from " + new URL(request.url).pathname);
					},
				};`,
				assets: { "style.css": "body { color: red; }" },
			},
		});
		const harness = useTestHarness({ workers: [{ buildOutput: "app" }] });

		const { url } = await harness.listen();
		expect(url.protocol).toBe("http:");
		expect(await (await harness.fetch("/users")).text()).toBe(
			"Hello from /users"
		);
		expect(await (await harness.fetch("/style.css")).text()).toBe(
			"body { color: red; }"
		);
	});

	it("runs an assets-only Worker", async ({ expect }) => {
		await writeBuild("app", {
			default: {
				config: { name: "app" },
				assets: { "index.html": "<h1>Hello</h1>" },
			},
		});
		const harness = useTestHarness({ workers: [{ buildOutput: "app" }] });

		await harness.listen();
		expect(await (await harness.fetch("/")).text()).toBe("<h1>Hello</h1>");
	});

	it("rejects Workers that use Containers", async ({ expect }) => {
		await writeBuild("app", {
			default: {
				config: {
					name: "app",
					exports: {
						Sandbox: {
							type: "durable-object",
							storage: "sqlite",
							container: "sandbox",
						},
					},
				},
				script: `export class Sandbox {}
					export default {};`,
			},
		});
		const harness = useTestHarness({ workers: [{ buildOutput: "app" }] });

		await expect(harness.listen()).rejects.toThrow(
			`The test harness doesn't support Containers yet, which the "Sandbox" export of Worker "app" uses.`
		);
	});

	it("reads secrets for the build's mode, which the test can override", async ({
		expect,
	}) => {
		await writeBuild(
			"app",
			{
				default: {
					config: {
						name: "app",
						env: {
							TOKEN: { type: "secret" },
							API_KEY: { type: "secret" },
							GREETING: { type: "text", value: "Hello" },
						},
					},
					script: `export default {
						fetch(request, env) {
							const { TOKEN, API_KEY, GREETING, EXTRA } = env;
							return Response.json({ TOKEN, API_KEY, GREETING, EXTRA });
						},
					};`,
				},
			},
			"staging"
		);
		await seed({
			"app/.dev.vars.production": "TOKEN=production\nAPI_KEY=production",
			"app/.dev.vars.staging": "TOKEN=staging",
		});
		const harness = useTestHarness({
			workers: [
				{
					buildOutput: "app",
					secrets: { API_KEY: "from-test" },
					vars: { GREETING: "Hi", EXTRA: { nested: true } },
				},
			],
		});

		await harness.listen();
		expect(await (await harness.fetch("/")).json()).toEqual({
			TOKEN: "staging",
			API_KEY: "from-test",
			GREETING: "Hi",
			EXTRA: { nested: true },
		});
		// API_KEY isn't in the staging file, but the test provides it
		expect(std.warn).toBe("");
	});

	it("runs Workers from several builds, picking non-default ones by name", async ({
		expect,
	}) => {
		await writeBuild("frontend", {
			default: {
				config: {
					name: "frontend",
					env: { API: { type: "worker", worker: "api" } },
				},
				script: `export default {
					async fetch(request, env) {
						return new Response("frontend -> " + (await (await env.API.fetch(request)).text()));
					},
				};`,
			},
		});
		const respondWith = (text: string) =>
			`export default { fetch() { return new Response(${JSON.stringify(text)}); } };`;
		await writeBuild("backend", {
			default: { config: { name: "api" }, script: respondWith("api") },
			// Build tools lowercase the folder name
			admin: { config: { name: "Admin" }, script: respondWith("admin") },
		});

		const harness = useTestHarness({
			workers: [{ buildOutput: "frontend" }, { buildOutput: "backend" }],
		});
		await harness.listen();
		expect(await (await harness.fetch("/")).text()).toBe("frontend -> api");

		const overridden = useTestHarness({
			workers: [
				{ buildOutput: "frontend", bindingOverrides: { API: "Admin" } },
				{ buildOutput: "backend", name: "Admin" },
			],
		});
		await overridden.listen();
		expect(await (await overridden.fetch("/")).text()).toBe(
			"frontend -> admin"
		);

		const missing = useTestHarness({
			workers: [{ buildOutput: "backend", name: "missing" }],
		});
		await expect(missing.listen()).rejects.toThrow(
			'No Worker named "missing" in the Build Output'
		);
	});

	it("connects remote bindings through a remote session", async ({
		expect,
	}) => {
		const session = { dispose: vi.fn() };
		vi.mocked(maybeStartOrUpdateRemoteProxySession).mockResolvedValue({
			session,
		} as unknown as Awaited<
			ReturnType<typeof maybeStartOrUpdateRemoteProxySession>
		>);
		const env = { KV: { type: "kv", id: "abc", dev: { remote: true } } };
		await writeBuild("app", {
			default: {
				config: { name: "app", env },
				script: `export default { fetch() { return new Response("ok"); } };`,
			},
		});
		const harness = createTestHarness({ workers: [{ buildOutput: "app" }] });

		await harness.listen();
		expect(maybeStartOrUpdateRemoteProxySession).toHaveBeenCalledWith(
			expect.objectContaining({ name: "app", target: "cf", env }),
			null,
			expect.objectContaining({ hook: expect.any(Function) }),
			expect.objectContaining({ cliDisplayName: "cf" })
		);
		// update() updates the session rather than starting another
		await harness.update((options) => options);
		expect(maybeStartOrUpdateRemoteProxySession).toHaveBeenLastCalledWith(
			expect.objectContaining({ name: "app" }),
			{ session },
			expect.anything(),
			expect.anything()
		);
		await harness.close();
		expect(session.dispose).toHaveBeenCalled();
	});

	it("disposes the remote session when the runtime fails to start", async ({
		expect,
	}) => {
		const session = { dispose: vi.fn() };
		vi.mocked(maybeStartOrUpdateRemoteProxySession).mockResolvedValue({
			session,
		} as unknown as Awaited<
			ReturnType<typeof maybeStartOrUpdateRemoteProxySession>
		>);
		await writeBuild("app", {
			default: {
				config: { name: "app" },
				script: `export default {`,
			},
		});
		const harness = useTestHarness({ workers: [{ buildOutput: "app" }] });

		await expect(harness.listen()).rejects.toThrow();
		expect(session.dispose).toHaveBeenCalled();
	});

	it("doesn't send a binding the test overrides to the remote session", async ({
		expect,
	}) => {
		await writeBuild("app", {
			default: {
				config: { name: "app", env: { AI: { type: "ai" } } },
				script: `export default {
					async fetch(request, env) {
						return Response.json(await env.AI.run("@cf/test/model", {}));
					},
				};`,
			},
			"mock-ai": {
				config: { name: "mock-ai" },
				script: `import { WorkerEntrypoint } from "cloudflare:workers";
					export default class MockAi extends WorkerEntrypoint {
						run(model) {
							return { model, response: "mock-ai" };
						}
					}`,
			},
		});
		const harness = useTestHarness({
			workers: [
				{ buildOutput: "app", bindingOverrides: { AI: "mock-ai" } },
				{ buildOutput: "app", name: "mock-ai" },
			],
		});

		await harness.listen();
		expect(await (await harness.fetch("/")).json()).toEqual({
			model: "@cf/test/model",
			response: "mock-ai",
		});
		expect(maybeStartOrUpdateRemoteProxySession).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "app",
				env: { AI: { type: "worker", worker: "mock-ai" } },
			}),
			null,
			expect.anything(),
			expect.anything()
		);
	});

	// Ported from Wrangler's e2e/createTestHarness.test.ts

	it("starts with default server options", async ({ expect, onTestFailed }) => {
		await writeBuild(".", {
			default: {
				config: { name: "hello-worker" },
				script: `
					export default {
						fetch(request) {
							if (new URL(request.url).pathname === "/url") {
								return new Response(request.url);
							}
							return new Response("Hello World");
						}
					};
				`,
			},
		});

		const server = createTestHarness({ workers: [{ buildOutput: "." }] });
		onTestFinished(server.close);
		onTestFailed(server.debug);

		const { url } = await server.listen();

		expect(url.protocol).toBe("http:");
		expect(url.hostname).toBe("127.0.0.1");
		expect(Number(url.port)).toBeGreaterThan(0);

		const response = await fetch(url);
		await expect(response.text()).resolves.toBe("Hello World");

		const relativeServerResponse = await server.fetch("/url");
		await expect(relativeServerResponse.text()).resolves.toBe(
			new URL("/url", url).href
		);

		const relativeWorkerResponse = await server.getWorker().fetch("/url");
		await expect(relativeWorkerResponse.text()).resolves.toBe(
			new URL("/url", url).href
		);
	});

	it("can be configured after creation", async ({ expect }) => {
		await writeBuild(".", {
			default: {
				config: {
					name: "delayed-config-worker",
					env: { GREETING: { type: "text", value: "initial" } },
				},
				script: `
					export default {
						fetch(_request, env) {
							return new Response(env.GREETING);
						}
					};
				`,
			},
		});

		const server = createTestHarness();
		onTestFinished(server.close);

		await expect(server.listen()).rejects.toThrow(
			"Test harness options have not been configured."
		);

		await server.update({ workers: [{ buildOutput: "." }] });
		await server.listen();

		const initialResponse = await server.fetch("/");
		await expect(initialResponse.text()).resolves.toBe("initial");

		await server.update((options) => ({
			...options,
			workers: options.workers.map((worker) => ({
				...worker,
				vars: { GREETING: "updated" },
			})),
		}));

		const updatedResponse = await server.fetch("/");
		await expect(updatedResponse.text()).resolves.toBe("updated");

		await server.reset();

		const resetResponse = await server.fetch("/");
		await expect(resetResponse.text()).resolves.toBe("initial");
	});

	it("support fetching different workers from the same session", async ({
		expect,
	}) => {
		await writeBuild(".", {
			default: {
				config: { name: "primary-worker" },
				script: `
					export default {
						fetch() {
							return new Response("Hello from Primary Worker");
						}
					};
				`,
			},
			"auxiliary-worker": {
				config: { name: "auxiliary-worker" },
				script: `
					export default {
						fetch() {
							return new Response("Hello from Auxiliary Worker");
						}
					};
				`,
			},
		});

		const server = createTestHarness({
			workers: [
				{ buildOutput: "." },
				{ buildOutput: ".", name: "auxiliary-worker" },
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

	it("exposes resource bindings scoped to each worker environment", async ({
		expect,
	}) => {
		await writeBuild(".", {
			default: {
				config: {
					name: "api-worker",
					env: {
						GREETING: { type: "text", value: "api" },
						STORE: { type: "kv", id: "api-store" },
						BUCKET: { type: "r2", name: "api-bucket" },
					},
				},
				script: `
					export default {
						async fetch(request, env) {
							const url = new URL(request.url);
							if (url.pathname === "/write-storage") {
								await env.STORE.put("key", "api");
								await env.BUCKET.put("key", "api");
								return new Response("written");
							}

							return new Response("ok");
						}
					};
				`,
			},
			"admin-worker": {
				config: {
					name: "admin-worker",
					env: {
						GREETING: { type: "text", value: "admin" },
						DATABASE: {
							type: "d1",
							id: "00000000-0000-0000-0000-000000000002",
						},
						OBJECT: {
							type: "durable-object",
							worker: "admin-worker",
							exportName: "Counter",
						},
					},
					exports: { Counter: { type: "durable-object", storage: "sqlite" } },
				},
				script: `
					import { DurableObject } from "cloudflare:workers";

					export class Counter extends DurableObject {
						async fetch() {
							const value = (await this.ctx.storage.get("value")) ?? 0;
							const next = value + 1;
							await this.ctx.storage.put("value", next);
							return new Response(String(next));
						}
					}

					export default {
						async fetch(request, env) {
							const url = new URL(request.url);
							if (url.pathname === "/write-storage") {
								await env.DATABASE.exec("CREATE TABLE entries (value TEXT);");
								await env.DATABASE.prepare("INSERT INTO entries (value) VALUES (?);")
									.bind("admin")
									.run();

								const id = env.OBJECT.idFromName("shared");
								const stub = env.OBJECT.get(id);
								return stub.fetch("http://example.com/");
							}

							return new Response("ok");
						}
					};
				`,
			},
		});

		const server = createTestHarness({
			workers: [
				{
					buildOutput: ".",
					secrets: { SECRET: "api-secret" },
				},
				{
					buildOutput: ".",
					name: "admin-worker",
					secrets: { SECRET: "admin-secret" },
				},
			],
		});
		onTestFinished(server.close);

		await server.listen();

		const api = server.getWorker<{
			GREETING: string;
			SECRET: string;
			STORE: KVNamespace;
			BUCKET: R2Bucket;
		}>("api-worker");
		const admin = server.getWorker<{
			GREETING: string;
			SECRET: string;
			DATABASE: D1Database;
			OBJECT: DurableObjectNamespace;
		}>("admin-worker");
		const apiWriteResponse = await api.fetch("/write-storage");
		expect(await apiWriteResponse.text()).toBe("written");
		const adminWriteResponse = await admin.fetch("/write-storage");
		expect(await adminWriteResponse.text()).toBe("1");

		const apiEnv = await api.getEnv();
		const adminEnv = await admin.getEnv();

		expect(apiEnv.GREETING).toBe("api");
		expect(apiEnv.SECRET).toBe("api-secret");
		expect(adminEnv.GREETING).toBe("admin");
		expect(adminEnv.SECRET).toBe("admin-secret");

		// KV Namespace
		await expect(apiEnv.STORE.get("key")).resolves.toBe("api");

		// R2 Bucket
		const object = await apiEnv.BUCKET.get("key");

		if (object === null) {
			expect.fail("Expected R2 object to exist");
		} else {
			await expect(object.text()).resolves.toBe("api");
		}

		// D1 Database
		await expect(
			adminEnv.DATABASE.prepare("SELECT value FROM entries").first("value")
		).resolves.toBe("admin");

		// Durable Object Namespace
		const adminStub = adminEnv.OBJECT.get(adminEnv.OBJECT.idFromName("shared"));
		const adminResponse = await adminStub.fetch("http://example.com/");
		await expect(adminResponse.text()).resolves.toBe("2");
	});

	it("supports service bindings between workers", async ({ expect }) => {
		await writeBuild(".", {
			default: {
				config: {
					name: "primary-worker",
					env: { AUXILIARY: { type: "worker", worker: "auxiliary-worker" } },
				},
				script: `
					export default {
						async fetch(request, env) {
							const url = new URL(request.url);
							if (url.pathname === "/call-auxiliary") {
								return env.AUXILIARY.fetch("http://auxiliary.example.com/from-primary");
							}

							return new Response("primary:" + url.pathname);
						}
					};
				`,
			},
			"auxiliary-worker": {
				config: {
					name: "auxiliary-worker",
					env: { PRIMARY: { type: "worker", worker: "primary-worker" } },
				},
				script: `
					export default {
						async fetch(request, env) {
							const url = new URL(request.url);
							if (url.pathname === "/call-primary") {
								return env.PRIMARY.fetch("http://primary.example.com/from-auxiliary");
							}

							return new Response("auxiliary:" + url.pathname);
						}
					};
				`,
			},
		});

		const server = createTestHarness({
			workers: [
				{ buildOutput: "." },
				{ buildOutput: ".", name: "auxiliary-worker" },
			],
		});
		onTestFinished(server.close);

		await server.listen();

		const auxiliaryResponse = await server
			.getWorker("primary-worker")
			.fetch("/call-auxiliary");
		await expect(auxiliaryResponse.text()).resolves.toBe(
			"auxiliary:/from-primary"
		);

		const primaryResponse = await server
			.getWorker("auxiliary-worker")
			.fetch("/call-primary");
		await expect(primaryResponse.text()).resolves.toBe(
			"primary:/from-auxiliary"
		);
	});

	it("supports binding overrides for first-party bindings", async ({
		expect,
	}) => {
		await writeBuild(".", {
			default: {
				config: { name: "app-worker", env: { AI: { type: "ai" } } },
				script: `
					export default {
						async fetch(_request, env) {
							return Response.json(await env.AI.run("@cf/test/model", {
								prompt: "What should the test return?"
							}));
						}
					};
				`,
			},
			"mock-ai": {
				config: { name: "mock-ai" },
				script: `
					import { WorkerEntrypoint } from "cloudflare:workers";

					let calls = 0;
					export default class MockAi extends WorkerEntrypoint {
						run(model, options) {
							calls += 1;
							return {
								model,
								response: "mock-ai:" + calls,
								prompt: options.prompt,
							};
						}
					}
				`,
			},
		});

		const server = createTestHarness({
			workers: [
				{
					buildOutput: ".",
					bindingOverrides: {
						AI: "mock-ai",
					},
				},
				{ buildOutput: ".", name: "mock-ai" },
			],
		});
		onTestFinished(server.close);

		await server.listen();

		const appResponse = await server.getWorker("app-worker").fetch("/");
		await expect(appResponse.json()).resolves.toEqual({
			model: "@cf/test/model",
			prompt: "What should the test return?",
			response: "mock-ai:1",
		});

		const secondAppResponse = await server.getWorker("app-worker").fetch("/");
		await expect(secondAppResponse.json()).resolves.toEqual({
			model: "@cf/test/model",
			prompt: "What should the test return?",
			response: "mock-ai:2",
		});

		await server.reset();

		const resetAppResponse = await server.getWorker("app-worker").fetch("/");
		await expect(resetAppResponse.json()).resolves.toEqual({
			model: "@cf/test/model",
			prompt: "What should the test return?",
			response: "mock-ai:1",
		});
	});

	it("returns the default worker export", async ({ expect }) => {
		await writeBuild(".", {
			default: {
				config: { name: "rpc-worker" },
				script: `
					import { WorkerEntrypoint } from "cloudflare:workers";

					export default class RpcWorker extends WorkerEntrypoint {
						getMessage(name) {
							return "Hello " + name;
						}
					}
				`,
			},
		});

		const server = createTestHarness({ workers: [{ buildOutput: "." }] });
		onTestFinished(server.close);

		await server.listen();

		interface RpcWorker extends CloudflareWorkersModule.WorkerEntrypoint {
			getMessage(name: string): string;
		}
		type RpcWorkerConstructor = new (
			...args: ConstructorParameters<
				typeof CloudflareWorkersModule.WorkerEntrypoint
			>
		) => RpcWorker;
		type RpcWorkerModule = { default: RpcWorkerConstructor };
		const rpcWorker = server.getWorker<unknown, RpcWorkerModule>("rpc-worker");
		const rpcExport = await rpcWorker.getExport();

		expect(await rpcExport.getMessage("World")).toBe("Hello World");
	});

	it("uses runtime errors for missing binding override targets", async ({
		expect,
	}) => {
		await writeBuild(".", {
			default: {
				config: { name: "app-worker", env: { AI: { type: "ai" } } },
				script: `
					export default {
						async fetch(_request, env) {
							return Response.json(await env.AI.run("@cf/test/model", {}));
						}
					};
				`,
			},
		});

		const server = createTestHarness({
			workers: [{ buildOutput: ".", bindingOverrides: { AI: "missing-ai" } }],
		});
		onTestFinished(server.close);

		await expect(server.listen()).rejects.toThrow("core:user:missing-ai");
	});

	it("routes fetches based on worker routes", async ({ expect }) => {
		const routesTo = (pattern: string) => [{ type: "fetch", pattern }];
		const respondWithName = (name: string) => `
			export default {
				fetch(request) {
					return Response.json({ name: ${JSON.stringify(name)}, url: request.url });
				}
			};
		`;
		await writeBuild(".", {
			default: {
				config: {
					name: "primary-worker",
					triggers: routesTo("primary.example.com/*"),
				},
				script: respondWithName("primary"),
			},
			"auxiliary-worker": {
				config: {
					name: "auxiliary-worker",
					triggers: routesTo("auxiliary.example.com/*"),
				},
				script: respondWithName("auxiliary"),
			},
		});

		const server = createTestHarness({
			workers: [
				{ buildOutput: "." },
				{ buildOutput: ".", name: "auxiliary-worker" },
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

		// update() reads the Build Output again
		await writeBuild(".", {
			default: {
				config: {
					name: "primary-worker",
					triggers: routesTo("primary.example.com/*"),
				},
				script: respondWithName("primary"),
			},
			"auxiliary-worker": {
				config: {
					name: "auxiliary-worker",
					triggers: routesTo("updated-auxiliary.example.com/*"),
				},
				script: respondWithName("auxiliary"),
			},
		});
		await server.update((options) => options);

		const updatedAuxiliaryResponse = await server.fetch(
			"http://updated-auxiliary.example.com/path?value=3"
		);
		await expect(updatedAuxiliaryResponse.json()).resolves.toEqual({
			name: "auxiliary",
			url: "http://updated-auxiliary.example.com/path?value=3",
		});
	});

	it("rejects updates that change the number of workers without committing them", async ({
		expect,
	}) => {
		await writeBuild(".", {
			default: {
				config: { name: "primary-worker" },
				script: `
					export default {
						fetch() {
							return new Response("primary");
						}
					};
				`,
			},
		});

		const server = createTestHarness({ workers: [{ buildOutput: "." }] });
		onTestFinished(server.close);

		await server.listen();

		await expect(
			server.update((options) => ({
				...options,
				workers: [
					...options.workers,
					{ buildOutput: ".", name: "auxiliary-worker" },
				],
			}))
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Updating the number of workers running in the server is not supported.]`
		);

		let workerCountAfterRejectedUpdate = 0;
		await server.update((options) => {
			workerCountAfterRejectedUpdate = options.workers.length;
			return options;
		});

		expect(workerCountAfterRejectedUpdate).toBe(1);
	});

	it("rejects update when a worker's Build Output can't be read", async ({
		expect,
	}) => {
		await writeBuild(".", {
			default: {
				config: { name: "primary-worker" },
				script: `
					export default {
						fetch() {
							return new Response("Hello from Primary Worker");
						}
					};
				`,
			},
		});

		const server = createTestHarness({ workers: [{ buildOutput: "." }] });
		onTestFinished(server.close);

		await server.listen();

		await seed({
			".cloudflare/output/v0/workers/default/worker.config.json": "{",
		});

		await expect(server.update((options) => options)).rejects.toThrow(
			"could not parse JSON"
		);
	});

	it("rejects calls on unknown worker handles", async ({ expect }) => {
		await writeBuild(".", {
			default: {
				config: { name: "primary-worker" },
				script: `
					export default {
						fetch() {
							return new Response("primary");
						}
					};
				`,
			},
		});

		const server = createTestHarness({ workers: [{ buildOutput: "." }] });
		onTestFinished(server.close);

		await server.listen();

		await expect(
			server.getWorker("unknown-worker").fetch("/")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[TypeError: Worker "unknown-worker" does not exist in this server.]`
		);

		await expect(
			server.getWorker("unknown-worker").scheduled({
				cron: "0 0 * * *",
			})
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[TypeError: Worker "unknown-worker" does not exist in this server.]`
		);
	});

	it("loads default .env files for build output workers", async ({
		expect,
	}) => {
		await writeBuild(".", {
			default: {
				config: {
					name: "env-worker",
					env: {
						CONFIG_VAR: { type: "text", value: "from-config" },
						ENV_SECRET: { type: "secret" },
					},
				},
				script: `
					export default {
						fetch(request, env) {
							return Response.json({
								CONFIG_VAR: env.CONFIG_VAR,
								ENV_SECRET: env.ENV_SECRET,
							});
						}
					};
				`,
			},
		});
		await seed({ ".env": "ENV_SECRET=from-env" });

		const server = createTestHarness({ workers: [{ buildOutput: "." }] });
		onTestFinished(server.close);

		await server.listen();

		const response = await server.fetch("/");
		await expect(response.json()).resolves.toEqual({
			CONFIG_VAR: "from-config",
			ENV_SECRET: "from-env",
		});
	});

	it("loads default .dev.vars files for build output workers", async ({
		expect,
	}) => {
		await writeBuild(".", {
			default: {
				config: {
					name: "dev-vars-worker",
					env: {
						CONFIG_VAR: { type: "text", value: "from-config" },
						SECRET: { type: "secret" },
					},
				},
				script: `
					export default {
						fetch(request, env) {
							return Response.json({
								CONFIG_VAR: env.CONFIG_VAR,
								SECRET: env.SECRET,
							});
						}
					};
				`,
			},
		});
		await seed({
			".env": "SECRET=from-env",
			".dev.vars": "SECRET=from-dev-vars",
		});

		const server = createTestHarness({ workers: [{ buildOutput: "." }] });
		onTestFinished(server.close);

		await server.listen();

		const response = await server.fetch("/");
		await expect(response.json()).resolves.toEqual({
			CONFIG_VAR: "from-config",
			SECRET: "from-dev-vars",
		});
	});

	it("overrides vars and secrets for build output workers", async ({
		expect,
	}) => {
		await writeBuild(".", {
			default: {
				config: {
					name: "var-overrides-worker",
					env: {
						CONFIG_VAR: { type: "text", value: "from-config" },
						API_TOKEN: { type: "secret" },
						SECRET_FROM_FILE: { type: "secret" },
					},
				},
				script: `
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
			},
		});
		await seed({
			".dev.vars": "API_TOKEN=from-dev-vars\nSECRET_FROM_FILE=from-dev-vars",
		});

		const server = createTestHarness({
			workers: [
				{
					buildOutput: ".",
					vars: {
						CONFIG_VAR: "from-override",
						ADDED_VAR: "from-override",
						NULL_VAR: null,
					},
					secrets: {
						API_TOKEN: "from-override",
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
			workers: [
				{
					buildOutput: ".",
					vars: {
						CONFIG_VAR: "from-updated-override",
						ADDED_VAR: "from-updated-override",
						NULL_VAR: null,
					},
					secrets: {
						API_TOKEN: "from-updated-override",
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
		await writeBuild(".", {
			default: {
				config: {
					name: "nodejs-compat-worker",
					compatibilityFlags: ["nodejs_compat"],
				},
				script: `
					import { Stream } from "node:stream";

					export default {
						fetch() {
							return new Response(String(typeof Stream));
						}
					};
				`,
			},
		});

		const server = createTestHarness({ workers: [{ buildOutput: "." }] });
		onTestFinished(server.close);

		await server.listen();

		const response = await server.fetch("/");
		await expect(response.text()).resolves.toBe("function");
	});

	it("uses ephemeral storage by default", async ({ expect }) => {
		await writeBuild(".", {
			default: {
				config: {
					name: "ephemeral-storage-worker",
					env: { STORE: { type: "kv", id: "test-store" } },
				},
				script: `
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
			},
		});

		const firstServer = createTestHarness({ workers: [{ buildOutput: "." }] });
		onTestFinished(firstServer.close);

		await firstServer.listen();

		const setResponse = await firstServer.fetch("/set");
		await expect(setResponse.text()).resolves.toBe("stored");

		const storedResponse = await firstServer.fetch("/");
		await expect(storedResponse.text()).resolves.toBe("value");

		await firstServer.close();

		const secondServer = createTestHarness({ workers: [{ buildOutput: "." }] });
		onTestFinished(secondServer.close);

		await secondServer.listen();

		const resetResponse = await secondServer.fetch("/");
		await expect(resetResponse.text()).resolves.toBe("missing");
	});

	it("resets server options and restarts the session", async ({ expect }) => {
		await writeBuild(".", {
			default: {
				config: {
					name: "storage-worker",
					env: { STORE: { type: "kv", id: "test-store" } },
				},
				script: `
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
			},
		});

		const server = createTestHarness({ workers: [{ buildOutput: "." }] });
		onTestFinished(server.close);

		await expect(server.reset()).rejects.toThrow(
			"Server has not been started. Start it with server.listen() before calling this method."
		);

		await server.listen();

		const setResponse = await server.fetch("/set");
		await expect(setResponse.text()).resolves.toBe("stored");
		const storedResponse = await server.fetch("/");
		await expect(storedResponse.text()).resolves.toBe("value");

		await server.reset();

		const resetResponse = await server.fetch("/");
		await expect(resetResponse.text()).resolves.toBe("missing");
	});

	it("triggers scheduled handlers", async ({ expect }) => {
		await writeBuild(".", {
			default: {
				config: { name: "scheduled-worker" },
				script: `
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
			},
		});

		const server = createTestHarness({ workers: [{ buildOutput: "." }] });
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

		server.debug();
		expect(normalizeDebugOutput(std.getAndClearOut())).toMatchInlineSnapshot(`
			"--------------- debug logs ---------------
			<timestamp> [server] startup - started
			<timestamp> [server] startup - completed
			<timestamp> [server] fetch - GET / - started
			<timestamp> [server] fetch - GET / - 200
			<timestamp> [server] [scheduled-worker] scheduled - GET /cdn-cgi/local/scheduled?format=json&cron=*+*+*+*+*&time=1700000100000 - started
			<timestamp> [server] [scheduled-worker] scheduled - GET /cdn-cgi/local/scheduled?format=json&cron=*+*+*+*+*&time=1700000100000 - 200
			<timestamp> [server] fetch - GET / - started
			<timestamp> [server] fetch - GET / - 200"
		`);
	});

	it("triggers email handlers", async ({ expect }) => {
		await writeBuild(".", {
			default: {
				config: { name: "email-worker" },
				script: `
					import { EmailMessage } from "cloudflare:email";

					export default {
						async email(message) {
							const mode = message.to.split("@")[0];
							if (mode === "rejected") {
								message.setReject("blocked sender");
								return;
							}

							await message.forward(
								"archive@example.com",
								new Headers({ "X-Test": mode })
							);
							await message.reply(new EmailMessage(
								\`reply-\${mode}@example.com\`,
								message.from,
								\`From: reply-\${mode}@example.com\r\nTo: \${message.from}\r\nIn-Reply-To: <\${mode}@example.com>\r\nMessage-ID: <reply-\${mode}@example.com>\r\nContent-Type: text/plain\r\n\r\nReply for \${mode}\r\n\`
							));

							if (mode === "exception") {
								message.setReject("triggered exception");
								throw new Error("sensitive handler error");
							}
						}
					};
				`,
			},
		});

		const server = createTestHarness({ workers: [{ buildOutput: "." }] });
		onTestFinished(server.close);
		await server.listen();
		const worker = server.getWorker();

		function createRawEmail(mode: string) {
			return `From: sender <sender@example.com>\r\nTo: ${mode} <${mode}@example.com>\r\nMessage-ID: <${mode}@example.com>\r\nContent-Type: text/plain\r\n\r\nMessage for ${mode}\r\n`;
		}

		await expect(
			worker.email({
				from: "sender@example.com",
				to: "ok@example.com",
				raw: createRawEmail("ok"),
			})
		).resolves.toEqual({
			outcome: "ok",
			forwards: [
				{
					recipient: "archive@example.com",
					headers: [["x-test", "ok"]],
					messageId: expect.any(String),
				},
			],
			replies: [
				{
					messageId: expect.any(String),
					sender: "reply-ok@example.com",
					raw: expect.stringContaining("Reply for ok"),
				},
			],
			events: [
				{
					type: "received",
					timestamp: expect.any(String),
				},
				{
					type: "forward",
					timestamp: expect.any(String),
					messageId: expect.any(String),
				},
				{
					type: "reply",
					timestamp: expect.any(String),
					messageId: expect.any(String),
				},
			],
		});

		await expect(
			worker.email({
				from: "sender@example.com",
				to: "rejected@example.com",
				raw: createRawEmail("rejected"),
			})
		).resolves.toEqual({
			outcome: "ok",
			rejectReason: "blocked sender",
			forwards: [],
			replies: [],
			events: [
				{ type: "received", timestamp: expect.any(String) },
				{ type: "reject", timestamp: expect.any(String) },
			],
		});

		await expect(
			worker.email({
				from: "sender@example.com",
				to: "exception@example.com",
				raw: createRawEmail("exception"),
			})
		).resolves.toEqual({
			outcome: "exception",
			rejectReason: "triggered exception",
			forwards: [
				{
					recipient: "archive@example.com",
					headers: [["x-test", "exception"]],
					messageId: expect.any(String),
				},
			],
			replies: [
				{
					messageId: expect.any(String),
					sender: "reply-exception@example.com",
					raw: expect.stringContaining("Reply for exception"),
				},
			],
			events: [
				{
					type: "received",
					timestamp: expect.any(String),
				},
				{
					type: "forward",
					timestamp: expect.any(String),
					messageId: expect.any(String),
				},
				{
					type: "reply",
					timestamp: expect.any(String),
					messageId: expect.any(String),
				},
				{ type: "reject", timestamp: expect.any(String) },
			],
		});

		await expect(
			worker.email({
				from: "sender@example.com",
				to: "invalid@example.com",
				raw: "From: sender@example.com\r\nTo: invalid@example.com\r\n\r\nInvalid",
			})
		).rejects.toThrow(
			"Failed to dispatch email event: Email could not be parsed: invalid or no message id provided"
		);

		await expect(
			worker.email({
				from: "sender@example.com",
				to: "stream@example.com",
				raw: new ReadableStream<Uint8Array>({
					start(controller) {
						const streamRaw = createRawEmail("stream");
						controller.enqueue(new TextEncoder().encode(streamRaw));
						controller.close();
					},
				}),
			})
		).resolves.toMatchObject({ outcome: "ok" });
	});

	it("does not reload when the Build Output changes", async ({ expect }) => {
		const respondWith = (text: string) => `
			export default {
				fetch() {
					return new Response(${JSON.stringify(text)});
				}
			};
		`;
		await writeBuild(".", {
			default: {
				config: { name: "create-server-test" },
				script: respondWith("Hello World"),
			},
		});

		const server = createTestHarness({ workers: [{ buildOutput: "." }] });
		onTestFinished(server.close);

		await server.listen();

		const response1 = await server.fetch("/");
		await expect(response1.text()).resolves.toBe("Hello World");

		await writeBuild(".", {
			default: {
				config: { name: "create-server-test" },
				script: respondWith("Greeting"),
			},
		});

		// Wait a moment to ensure that if the server were going to reload, it would have done so by now
		await setTimeout(1000);

		const response2 = await server.fetch("/");
		await expect(response2.text()).resolves.toBe("Hello World");

		await writeBuild(".", {
			default: {
				config: { name: "create-server-test" },
				script: respondWith("Bonjour"),
			},
		});

		await setTimeout(1000);

		const response3 = await server.fetch("/");
		await expect(response3.text()).resolves.toBe("Hello World");
	});

	it("captures runtime logs and prints debug timelines", async ({ expect }) => {
		await writeBuild(".", {
			default: {
				config: { name: "primary-worker" },
				script: `
					export default {
						fetch() {
							console.info("primary log");
							return new Response("primary ok");
						}
					};
				`,
			},
			"auxiliary-worker": {
				config: { name: "auxiliary-worker" },
				script: `
					export default {
						fetch() {
							console.warn("auxiliary warning");
							throw new Error("auxiliary failed");
						}
					};
				`,
			},
		});

		const server = createTestHarness({
			workers: [
				{ buildOutput: "." },
				{ buildOutput: ".", name: "auxiliary-worker" },
			],
		});
		onTestFinished(server.close);

		server.debug();

		expect(std.getAndClearOut()).toMatchInlineSnapshot(
			`"-------------- No debug log --------------"`
		);

		await server.listen();
		expect(server.getLogs()).toEqual([]);

		server.clearLogs();

		const primaryResponse = await server.getWorker("primary-worker").fetch("/");

		await expect(primaryResponse.text()).resolves.toBe("primary ok");
		// Without Wrangler's error middleware in the bundle, an uncaught error is
		// a 500 response rather than a rejection
		const auxiliaryResponse = await server
			.getWorker("auxiliary-worker")
			.fetch("https://example.com/greet", { method: "post" });
		expect(auxiliaryResponse.status).toBe(500);
		expect(server.getLogs()).toEqual([
			{ timestamp: expect.any(Number), level: "info", message: "primary log" },
			{
				timestamp: expect.any(Number),
				level: "warn",
				message: "auxiliary warning",
			},
		]);

		server.debug();
		expect(normalizeDebugOutput(std.getAndClearOut())).toMatchInlineSnapshot(`
			"--------------- debug logs ---------------
			<timestamp> [server] startup - started
			<timestamp> [server] startup - completed
			<timestamp> [server] [primary-worker] fetch - GET / - started
			<timestamp> [runtime] info: primary log
			<timestamp> [server] [primary-worker] fetch - GET / - 200
			<timestamp> [server] [auxiliary-worker] fetch - POST https://example.com/greet - started
			<timestamp> [runtime] warn: auxiliary warning
			<timestamp> [server] [auxiliary-worker] fetch - POST https://example.com/greet - 500"
		`);

		server.clearLogs();
		expect(server.getLogs()).toEqual([]);

		server.debug();
		expect(normalizeDebugOutput(std.getAndClearOut())).toMatchInlineSnapshot(`
			"--------------- debug logs ---------------
			<timestamp> [server] startup - started
			<timestamp> [server] startup - completed
			<timestamp> [server] [primary-worker] fetch - GET / - started
			<timestamp> [runtime] info: primary log
			<timestamp> [server] [primary-worker] fetch - GET / - 200
			<timestamp> [server] [auxiliary-worker] fetch - POST https://example.com/greet - started
			<timestamp> [runtime] warn: auxiliary warning
			<timestamp> [server] [auxiliary-worker] fetch - POST https://example.com/greet - 500"
		`);

		await server.reset();
		expect(server.getLogs()).toEqual([]);

		server.debug();
		expect(normalizeDebugOutput(std.getAndClearOut())).toMatchInlineSnapshot(`
			"--------------- debug logs ---------------
			<timestamp> [server] startup - started
			<timestamp> [server] startup - completed"
		`);

		await server.update((options) => ({
			...options,
			workers: [...options.workers],
		}));
		expect(server.getLogs()).toEqual([]);

		server.debug();
		expect(normalizeDebugOutput(std.getAndClearOut())).toMatchInlineSnapshot(`
			"--------------- debug logs ---------------
			<timestamp> [server] startup - started
			<timestamp> [server] startup - completed
			<timestamp> [server] update - started
			<timestamp> [server] update - completed"
		`);

		// Make sure debug logs are still visible after server is closed
		await server.close();

		server.debug();
		expect(normalizeDebugOutput(std.getAndClearOut())).toMatchInlineSnapshot(`
			"--------------- debug logs ---------------
			<timestamp> [server] startup - started
			<timestamp> [server] startup - completed
			<timestamp> [server] update - started
			<timestamp> [server] update - completed
			<timestamp> [server] teardown - started
			<timestamp> [server] teardown - completed"
		`);
	});
});
