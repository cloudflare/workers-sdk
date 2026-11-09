import { execFileSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { isDockerRunning } from "@cloudflare/containers-shared";
import { maybeStartOrUpdateRemoteProxySession } from "@cloudflare/remote-bindings";
import { getDockerPath } from "@cloudflare/workers-utils/docker-path";
import {
	mockConsoleMethods,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { beforeEach, describe, it, onTestFinished, vi } from "vitest";
import { createTestHarness } from "../index";
import type { TestHarnessOptions } from "../index";
import type {
	CloudflareWorkersModule,
	D1Database,
	DurableObjectNamespace,
	ExportedHandler,
	KVNamespace,
	R2Bucket,
} from "@cloudflare/workers-types";
import type { AddressInfo } from "node:net";

// Starting a real session needs Cloudflare credentials
vi.mock("@cloudflare/remote-bindings", () => ({
	maybeStartOrUpdateRemoteProxySession: vi.fn(),
}));

// CI always has Docker; local runs without it skip the container test
const isDockerAvailable =
	process.env.CI === "true" || (await isDockerRunning(getDockerPath()));

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
 * @param contents The code of an inline Worker's only module
 * @returns The Worker's manifest
 */
function singleModuleManifest(contents: string) {
	return {
		mainModule: "index.js",
		modules: { "index.js": { type: "esm", contents } },
	} as const;
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

	// As the Vite plugin's container tests: images are linux/amd64, which CI
	// runs on Linux only, and local runs without Docker skip
	it.skipIf(
		(process.platform !== "linux" && process.env.CI === "true") ||
			process.env.LOCAL_TESTS_WITHOUT_DOCKER === "true" ||
			!isDockerAvailable
	)(
		"runs a Container-backed Durable Object from a locally built image",
		{ timeout: 180_000 },
		async ({ expect }) => {
			// Stands in for the image a build tool builds for the Build Output
			const image = "test-harness-container:test";
			await seed({
				"image/Dockerfile": [
					"FROM node:22-alpine",
					`RUN echo 'require("http").createServer((req, res) => res.end("Hello from the container")).listen(8080)' > app.js`,
					'CMD ["node", "app.js"]',
				].join("\n"),
			});
			execFileSync(
				getDockerPath(),
				["build", "--platform", "linux/amd64", "--tag", image, "image"],
				{ stdio: "ignore" }
			);
			onTestFinished(() => {
				execFileSync(getDockerPath(), ["image", "rm", "--force", image], {
					stdio: "ignore",
				});
			});

			await writeBuild(".", {
				default: {
					config: {
						name: "container-worker",
						exports: {
							Sandbox: {
								type: "durable-object",
								storage: "sqlite",
								container: "sandbox",
							},
						},
						env: {
							SANDBOX: {
								type: "durable-object",
								worker: "container-worker",
								exportName: "Sandbox",
							},
						},
					},
					script: `
						import { DurableObject } from "cloudflare:workers";

						export class Sandbox extends DurableObject {
							fetch() {
								if (!this.ctx.container.running) {
									this.ctx.container.start({ enableInternet: false });
								}
								return this.ctx.container.getTcpPort(8080).fetch("http://container/");
							}
						}

						export default {
							fetch(request, env) {
								return env.SANDBOX.get(env.SANDBOX.idFromName("test")).fetch(request);
							}
						};
					`,
				},
			});
			await seed({
				".cloudflare/output/v0/containers/sandbox/container.config.json":
					JSON.stringify({ name: "sandbox", image: { localReference: image } }),
			});
			const harness = useTestHarness({ workers: [{ buildOutput: "." }] });

			await harness.listen();
			// The container takes a moment to start listening
			await vi.waitFor(
				async () => {
					expect(await (await harness.fetch("/")).text()).toBe(
						"Hello from the container"
					);
				},
				{ timeout: 60_000, interval: 500 }
			);
		}
	);

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

	it("connects a Hyperdrive binding to its local connection string from .env", async ({
		expect,
	}) => {
		// Stands in for the database: with `sslmode=disable`, workerd connects
		// straight to the connection string's host
		const database = net.createServer((socket) => {
			socket.end("hello from the database");
		});
		await new Promise<void>((resolve) => {
			database.listen(0, "127.0.0.1", resolve);
		});
		onTestFinished(() => {
			database.close();
		});
		const { port } = database.address() as AddressInfo;
		await writeBuild(".", {
			default: {
				config: {
					name: "hyperdrive-worker",
					env: { HYPERDRIVE: { type: "hyperdrive", id: "hyperdrive-id" } },
				},
				script: `export default {
					async fetch(request, env) {
						const socket = env.HYPERDRIVE.connect();
						const reply = await new Response(socket.readable).text();
						return new Response(env.HYPERDRIVE.database + ": " + reply);
					},
				};`,
			},
		});
		await seed({
			".env": `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgres://user:password@127.0.0.1:${port}/app?sslmode=disable`,
		});
		const harness = useTestHarness({ workers: [{ buildOutput: "." }] });

		await harness.listen();
		expect(await (await harness.fetch("/")).text()).toBe(
			"app: hello from the database"
		);
	});

	it("runs Build Output with a complete manifest and a source map, as Wrangler writes it", async ({
		expect,
	}) => {
		const workerDir = ".cloudflare/output/v0/workers/default";
		await seed({
			".cloudflare/output/v0/config.json": JSON.stringify({
				buildContext: { isPreview: false, mode: "production" },
			}),
			[`${workerDir}/worker.config.json`]: JSON.stringify({
				name: "wrangler-built-worker",
				compatibilityDate: "2026-06-01",
				manifest: {
					type: "complete",
					mainModule: "index.js",
					modules: {
						"index.js": { type: "esm" },
						"index.js.map": { type: "sourcemap" },
					},
				},
			}),
			[`${workerDir}/bundle/index.js`]: [
				`export default { fetch() { return new Response("Hello from Wrangler's build"); } };`,
				"//# sourceMappingURL=index.js.map",
			].join("\n"),
			[`${workerDir}/bundle/index.js.map`]: JSON.stringify({
				version: 3,
				sources: ["../src/index.ts"],
				mappings: "AAAA",
			}),
		});
		const harness = useTestHarness({ workers: [{ buildOutput: "." }] });

		await harness.listen();
		expect(await (await harness.fetch("/")).text()).toBe(
			"Hello from Wrangler's build"
		);
	});

	it("runs a Python Worker", async ({ expect }) => {
		const workerDir = ".cloudflare/output/v0/workers/default";
		await seed({
			".cloudflare/output/v0/config.json": JSON.stringify({
				buildContext: { isPreview: false, mode: "production" },
			}),
			[`${workerDir}/worker.config.json`]: JSON.stringify({
				name: "python-worker",
				compatibilityDate: "2025-05-01",
				compatibilityFlags: ["python_workers", "python_no_global_handlers"],
				manifest: {
					type: "complete",
					mainModule: "index.py",
					modules: {
						"index.py": { type: "python" },
						"greeting.py": { type: "python" },
					},
				},
			}),
			[`${workerDir}/bundle/index.py`]: [
				"from greeting import greet",
				"from workers import Response, WorkerEntrypoint",
				"",
				"class Default(WorkerEntrypoint):",
				"  def fetch(self, request):",
				"    return Response(greet('Python'))",
			].join("\n"),
			[`${workerDir}/bundle/greeting.py`]: [
				"def greet(name):",
				"  return 'Hello from ' + name",
			].join("\n"),
		});
		const harness = useTestHarness({ workers: [{ buildOutput: "." }] });

		await harness.listen();
		expect(await (await harness.fetch("/")).text()).toBe("Hello from Python");
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

	it("evicts Durable Objects by class name or binding name", async ({
		expect,
	}) => {
		await writeBuild(".", {
			default: {
				config: {
					name: "do-worker",
					exports: { Counter: { type: "durable-object", storage: "sqlite" } },
					env: {
						COUNTER: {
							type: "durable-object",
							worker: "do-worker",
							exportName: "Counter",
						},
					},
				},
				script: `
					import { DurableObject } from "cloudflare:workers";

					export class Counter extends DurableObject {
						memoryCount = 0;

						async fetch() {
							this.memoryCount += 1;
							const storageCount = ((await this.ctx.storage.get("count")) ?? 0) + 1;
							await this.ctx.storage.put("count", storageCount);
							return Response.json({
								memoryCount: this.memoryCount,
								storageCount,
							});
						}
					}

					export default {
						fetch(_request, _env, ctx) {
							const id = ctx.exports.Counter.idFromName("user-123");
							return ctx.exports.Counter.get(id).fetch("http://counter");
						}
					};
				`,
			},
		});

		const server = createTestHarness({ workers: [{ buildOutput: "." }] });
		onTestFinished(server.close);

		await server.listen();

		const worker = server.getWorker<
			{ COUNTER: DurableObjectNamespace },
			{
				default: ExportedHandler<{ COUNTER: DurableObjectNamespace }>;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Match runtime class exports by instance type.
				Counter: new (...args: any[]) => CloudflareWorkersModule.DurableObject;
			}
		>("do-worker");

		const response1 = await worker.fetch("/");
		expect(await response1.json()).toEqual({
			memoryCount: 1,
			storageCount: 1,
		});

		// Evict by class name
		await worker.evictDurableObject("Counter", { name: "user-123" });

		const response2 = await worker.fetch("/");
		expect(await response2.json()).toEqual({
			memoryCount: 1,
			storageCount: 2,
		});

		// Evict by binding name
		await worker.evictDurableObject("COUNTER", { name: "user-123" });

		const response3 = await worker.fetch("/");
		expect(await response3.json()).toEqual({
			memoryCount: 1,
			storageCount: 3,
		});
	});

	it("exposes Durable Object storage", async ({ expect, onTestFailed }) => {
		await writeBuild(".", {
			default: {
				config: {
					name: "do-worker",
					exports: {
						TestObject: { type: "durable-object", storage: "sqlite" },
					},
					env: {
						OBJECT: {
							type: "durable-object",
							worker: "do-worker",
							exportName: "TestObject",
						},
					},
				},
				script: `
					import { DurableObject } from "cloudflare:workers";

					export class TestObject extends DurableObject {
						constructor(ctx, env) {
							super(ctx, env);
							this.ctx.storage.sql.exec(
								"CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, value TEXT)"
							);
						}

						fetch(request) {
							const url = new URL(request.url);
							const sql = this.ctx.storage.sql;

							if (url.pathname === "/write") {
								sql.exec(
									"INSERT OR REPLACE INTO entries (id, value) VALUES ('key', ?)",
									url.searchParams.get("value")
								);
								return new Response("ok");
							}

							const row = sql.exec("SELECT value FROM entries WHERE id = 'key'").one();
							return new Response(row?.value ?? "missing");
						}
					}

					export default {
						fetch(request, env) {
							const url = new URL(request.url);
							const id = env.OBJECT.idFromName(url.searchParams.get("name") ?? "user-123");
							return env.OBJECT.get(id).fetch(request);
						}
					}
				`,
			},
		});

		const server = createTestHarness({ workers: [{ buildOutput: "." }] });
		onTestFinished(server.close);
		onTestFailed(server.debug);

		await server.listen();

		const worker = server.getWorker<
			{ OBJECT: DurableObjectNamespace },
			{
				default: ExportedHandler<{ OBJECT: DurableObjectNamespace }>;
				TestObject: new (
					// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Match runtime class exports by instance type.
					...args: any[]
				) => CloudflareWorkersModule.DurableObject;
			}
		>();

		const storageByClassName = await worker.getDurableObjectStorage(
			"TestObject",
			{
				name: "by-class",
			}
		);
		await storageByClassName.exec(
			"INSERT INTO entries (id, value) VALUES ('key', ?)",
			"seeded-by-class"
		);

		const response3 = await worker.fetch("/read?name=by-class");
		await expect(response3.text()).resolves.toBe("seeded-by-class");

		const storageByBindingName = await worker.getDurableObjectStorage(
			"OBJECT",
			{
				name: "user-123",
			}
		);
		await storageByBindingName.exec(
			"INSERT INTO entries (id, value) VALUES ('key', ?)",
			"seeded"
		);

		const response1 = await worker.fetch("/read?name=user-123");
		await expect(response1.text()).resolves.toBe("seeded");

		const response2 = await worker.fetch("/write?name=user-123&value=app");
		await expect(response2.text()).resolves.toBe("ok");

		const rows = await storageByBindingName.exec<{ value: string }>(
			"SELECT value FROM entries WHERE id = 'key'"
		);
		expect(rows).toEqual([{ value: "app" }]);
	});

	it("introspects Workflow instances by binding name", async ({ expect }) => {
		await writeBuild(".", {
			default: {
				config: {
					name: "workflow-worker",
					exports: {
						ModeratorWorkflow: { type: "workflow", name: "moderator-workflow" },
					},
					env: {
						MODERATOR: {
							type: "workflow",
							name: "moderator-workflow",
							worker: "workflow-worker",
							exportName: "ModeratorWorkflow",
						},
					},
				},
				script: `
					import { WorkflowEntrypoint } from "cloudflare:workers";

					export class ModeratorWorkflow extends WorkflowEntrypoint {
						async run(event, step) {
							if (event.payload?.streamTest) {
								const stream = await step.do("stream result", async () => {
									return new ReadableStream({
										start(controller) {
											controller.enqueue(new TextEncoder().encode("real stream"));
											controller.close();
										}
									});
								});
								return { streamResult: await new Response(stream).text() };
							}

							await step.sleep("sleep for a while", "10 seconds");

							const result = await step.do("AI content scan", async () => {
								const violationScore = Math.floor(Math.random() * 100);
								return { violationScore };
							});

							if (result.violationScore < 10) {
								await step.do("auto approve content", async () => {
									return { status: "auto_approved" };
								});
								return { status: "auto_approved" };
							}

							await step.do("auto reject content", async () => {
								return { status: "auto_rejected" };
							});
							return { status: "auto_rejected" };
						}
					}

					export default {
						async fetch(request, env) {
							const url = new URL(request.url);

							if (url.pathname === "/moderate-known") {
								const id = url.searchParams.get("id");
								const workflow = await env.MODERATOR.create({ id });
								return Response.json({ id: workflow.id });
							}

							if (url.pathname === "/moderate") {
								const workflow = await env.MODERATOR.create();
								return Response.json({
									id: workflow.id,
									details: await workflow.status()
								});
							}

							if (url.pathname === "/moderate-batch") {
								const workflows = await env.MODERATOR.createBatch([
									{},
									{ id: "321" },
									{}
								]);
								return Response.json({ ids: workflows.map((workflow) => workflow.id) });
							}

							if (url.pathname === "/moderate-stream") {
								const workflow = await env.MODERATOR.create({ params: { streamTest: true } });
								return Response.json({ id: workflow.id });
							}

							return new Response("Not found", { status: 404 });
						}
					};
				`,
			},
		});

		const server = createTestHarness({ workers: [{ buildOutput: "." }] });
		onTestFinished(server.close);

		await server.listen();

		const worker = server.getWorker("workflow-worker");
		const stepName = "AI content scan";
		const mockResult = { violationScore: 0 };

		const instanceId = "known-workflow-instance";
		const instance = await worker.introspectWorkflowInstance(
			"MODERATOR",
			instanceId
		);
		onTestFinished(instance.dispose);

		await instance.modify(async (modifier) => {
			await modifier.disableSleeps();
			await modifier.mockStepResult({ name: stepName }, mockResult);
		});

		const response = await worker.fetch(`/moderate-known?id=${instanceId}`);
		await expect(response.json()).resolves.toEqual({ id: instanceId });

		await expect(
			instance.waitForStepResult({ name: stepName })
		).resolves.toEqual(mockResult);
		await expect(instance.waitForStatus("complete")).resolves.not.toThrow();
		await expect(instance.getOutput()).resolves.toEqual({
			status: "auto_approved",
		});

		const workflow = await worker.introspectWorkflow("MODERATOR");
		onTestFinished(workflow.dispose);
		await expect(worker.introspectWorkflow("MODERATOR")).rejects.toThrow(
			`Workflow "moderator-workflow" already has an active introspection session for binding "MODERATOR".`
		);
		await workflow.modifyAll(async (modifier) => {
			await modifier.disableSleeps();
			await modifier.mockStepResult({ name: stepName }, mockResult);
		});

		const unknownIdResponse = await worker.fetch("/moderate");
		const unknownIdResult = (await unknownIdResponse.json()) as { id: string };
		expect(unknownIdResult.id).not.toBe(instanceId);

		const instances = await workflow.get();
		expect(instances).toHaveLength(1);
		await expect(
			instances[0]?.waitForStepResult({ name: stepName })
		).resolves.toEqual(mockResult);
		await expect(
			instances[0]?.waitForStatus("complete")
		).resolves.not.toThrow();
		await expect(instances[0]?.getOutput()).resolves.toEqual({
			status: "auto_approved",
		});
		await workflow.dispose();
		await expect(workflow.get()).rejects.toThrow(
			`Workflow "moderator-workflow" does not have an active introspection session for this introspector.`
		);
		await expect(workflow.modifyAll(async () => {})).rejects.toThrow(
			`Workflow "moderator-workflow" does not have an active introspection session for this introspector.`
		);

		const batchWorkflow = await worker.introspectWorkflow("MODERATOR");
		onTestFinished(batchWorkflow.dispose);
		await batchWorkflow.modifyAll(async (modifier) => {
			await modifier.disableSleeps();
			await modifier.mockStepResult({ name: stepName }, mockResult);
		});

		const batchResponse = await worker.fetch("/moderate-batch");
		await expect(batchResponse.json()).resolves.toMatchObject({
			ids: [expect.any(String), "321", expect.any(String)],
		});

		const batchInstances = await batchWorkflow.get();
		expect(batchInstances).toHaveLength(3);
		for (const batchInstance of batchInstances) {
			await expect(
				batchInstance.waitForStepResult({ name: stepName })
			).resolves.toEqual(mockResult);
			await expect(
				batchInstance.waitForStatus("complete")
			).resolves.not.toThrow();
			await expect(batchInstance.getOutput()).resolves.toEqual({
				status: "auto_approved",
			});
		}

		await batchWorkflow.dispose();

		const streamWorkflow = await worker.introspectWorkflow("MODERATOR");
		onTestFinished(streamWorkflow.dispose);
		await streamWorkflow.modifyAll(async (modifier) => {
			await modifier.mockStepResult(
				{ name: "stream result" },
				new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode("mock stream"));
						controller.close();
					},
				})
			);
		});

		await worker.fetch("/moderate-stream");
		const [streamInstance] = await streamWorkflow.get();
		await expect(
			streamInstance?.waitForStatus("complete")
		).resolves.not.toThrow();
		await expect(streamInstance?.getOutput()).resolves.toEqual({
			streamResult: "mock stream",
		});
	});

	it("applies D1 migrations to a worker binding", async ({ expect }) => {
		await writeBuild(".", {
			default: {
				config: {
					name: "d1-worker",
					env: {
						DATABASE: {
							type: "d1",
							id: "00000000-0000-0000-0000-000000000001",
						},
					},
				},
				script: `
					export default {
						async fetch(request, env) {
							const key = new URL(request.url).pathname.slice(1);
							const row = await env.DATABASE.prepare("SELECT value FROM settings WHERE key = ?")
								.bind(key)
								.first();

							if (row === null) {
								return new Response("missing", { status: 404 });
							}

							return new Response(row.value);
						}
					};
				`,
			},
		});
		await seed({
			"migrations/0001_settings/migration.sql": `
				CREATE TABLE settings (
					key TEXT PRIMARY KEY,
					value TEXT NOT NULL
				);
			`,
			"migrations/0002_seed/migration.sql": `
				INSERT INTO settings (key, value) VALUES ('greeting', 'Hello D1');
			`,
		});
		// Wrangler's test sets these as migrations_dir, migrations_pattern and
		// migrations_table
		const migrationsOptions = {
			dir: "migrations",
			pattern: "migrations/*/migration.sql",
			table: "custom_migrations",
		};

		const server = createTestHarness({ workers: [{ buildOutput: "." }] });
		onTestFinished(server.close);

		await server.listen();

		const worker = server.getWorker<{ DATABASE: D1Database }>();
		await worker.applyD1Migrations("DATABASE", migrationsOptions);

		const response = await worker.fetch("/greeting");
		await expect(response.text()).resolves.toBe("Hello D1");

		await worker.applyD1Migrations("DATABASE", migrationsOptions);
		const secondResponse = await worker.fetch("/greeting");
		await expect(secondResponse.text()).resolves.toBe("Hello D1");

		const env = await worker.getEnv();
		await expect(
			env.DATABASE.prepare(
				"SELECT COUNT(*) AS count FROM custom_migrations"
			).first("count")
		).resolves.toBe(2);

		server.debug();
		const debugOutput = normalizeDebugOutput(std.getAndClearOut());
		expect(debugOutput).toContain(
			"[server] [d1-worker] d1 migrations - DATABASE - applied 0001_settings/migration.sql"
		);
		expect(debugOutput).toContain(
			"[server] [d1-worker] d1 migrations - DATABASE - applied 0002_seed/migration.sql"
		);
		expect(debugOutput).toContain(
			"[server] [d1-worker] d1 migrations - DATABASE - completed (2 applied)"
		);
		expect(debugOutput).toContain(
			"[server] [d1-worker] d1 migrations - DATABASE - completed (no migrations to apply)"
		);
	});

	it("applies D1 migrations from the `dir` option", async ({ expect }) => {
		await writeBuild("app", {
			default: {
				config: {
					name: "d1-worker",
					env: { DATABASE: { type: "d1" } },
				},
				script: `export default {};`,
			},
		});
		await seed({
			"app/db/0001_settings.sql": "CREATE TABLE settings (key TEXT);",
		});

		const server = createTestHarness({ workers: [{ buildOutput: "app" }] });
		onTestFinished(server.close);

		await server.listen();

		const worker = server.getWorker<{ DATABASE: D1Database }>();
		await expect(worker.applyD1Migrations("DATABASE")).rejects.toThrow(
			`No migrations present at ${path.resolve("app/migrations")}.`
		);
		// Relative to the Worker's project directory
		await worker.applyD1Migrations("DATABASE", { dir: "db" });

		const env = await worker.getEnv();
		await expect(
			env.DATABASE.prepare("SELECT name FROM d1_migrations").first("name")
		).resolves.toBe("0001_settings.sql");
	});

	it("checks D1 migration options as `cf d1 migrations apply` does", async ({
		expect,
	}) => {
		await writeBuild("app", {
			default: {
				config: { name: "d1-worker", env: { DATABASE: { type: "d1" } } },
				script: `export default {};`,
			},
		});
		await seed({
			"app/migrations/0001_init/migration.sql":
				"CREATE TABLE settings (key TEXT);",
		});

		const server = createTestHarness({ workers: [{ buildOutput: "app" }] });
		onTestFinished(server.close);

		await server.listen();

		const worker = server.getWorker<{ DATABASE: D1Database }>();
		await expect(
			worker.applyD1Migrations("DATABASE", {
				pattern: "migrations/*/migration.sql",
			})
		).rejects.toThrow(
			'You have set `pattern: "migrations/*/migration.sql"` but have not set `dir`.'
		);
		await expect(
			worker.applyD1Migrations("DATABASE", {
				dir: "db",
				pattern: "migrations/*/migration.sql",
			})
		).rejects.toThrow('must start with "db/" to match `dir: "db"`');
		// Neither got as far as creating the migrations table
		const env = await worker.getEnv();
		await expect(
			env.DATABASE.prepare(
				"SELECT name FROM sqlite_master WHERE name = 'd1_migrations'"
			).first()
		).resolves.toBeNull();

		// The default pattern doesn't match Drizzle's nested layout
		await worker.applyD1Migrations("DATABASE");
		expect(std.warn).toContain(
			'set `dir: "migrations"` and `pattern: "migrations/*/migration.sql"`'
		);
	});

	it("rejects a Worker's call to another Worker that throws, as in production", async ({
		expect,
	}) => {
		const server = createTestHarness({
			workers: [
				{
					config: {
						name: "caller",
						compatibilityDate: "2026-05-20",
						env: { CALLEE: { type: "worker", worker: "callee" } },
						manifest: singleModuleManifest(`
							export default {
								async fetch(request, env) {
									try {
										await env.CALLEE.fetch("http://callee/");
										return new Response("no error");
									} catch (error) {
										return new Response("caught: " + error.message);
									}
								}
							};
						`),
					},
				},
				{
					config: {
						name: "callee",
						compatibilityDate: "2026-05-20",
						manifest: singleModuleManifest(`
							export default {
								fetch() {
									throw new Error("callee failed");
								}
							};
						`),
					},
				},
			],
		});
		onTestFinished(server.close);

		await server.listen();

		const response = await server.fetch("/");
		await expect(response.text()).resolves.toBe("caught: callee failed");
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
		});

		const server = createTestHarness({
			workers: [
				{
					buildOutput: ".",
					bindingOverrides: {
						AI: "mock-ai",
					},
				},
				{
					config: {
						name: "mock-ai",
						compatibilityDate: "2026-05-20",
						manifest: singleModuleManifest(`
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
						`),
					},
				},
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
		await writeBuild(".", {
			default: {
				config: {
					name: "primary-worker",
					triggers: [{ type: "fetch", pattern: "primary.example.com/*" }],
				},
				script: `
					export default {
						fetch(request) {
							return Response.json({ name: "primary", url: request.url });
						}
					};
				`,
			},
		});
		const auxiliaryScript = `
			export default {
				fetch(request) {
					return Response.json({ name: "auxiliary", url: request.url });
				}
			};
		`;

		const server = createTestHarness({
			workers: [
				{ buildOutput: "." },
				{
					config: {
						name: "auxiliary-worker",
						compatibilityDate: "2026-05-20",
						triggers: [{ type: "fetch", pattern: "auxiliary.example.com/*" }],
						manifest: singleModuleManifest(auxiliaryScript),
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
			workers: [
				{ buildOutput: "." },
				{
					config: {
						name: "auxiliary-worker",
						compatibilityDate: "2026-05-20",
						triggers: [
							{ type: "fetch", pattern: "updated-auxiliary.example.com/*" },
						],
						manifest: singleModuleManifest(auxiliaryScript),
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

		await server.reset();

		const resetAuxiliaryResponse = await server.fetch(
			"http://auxiliary.example.com/path?value=4"
		);
		await expect(resetAuxiliaryResponse.json()).resolves.toEqual({
			name: "auxiliary",
			url: "http://auxiliary.example.com/path?value=4",
		});
	});

	it("rejects updates that change the number of workers without committing them", async ({
		expect,
	}) => {
		const server = createTestHarness({
			workers: [
				{
					config: {
						name: "primary-worker",
						compatibilityDate: "2026-05-20",
						manifest: singleModuleManifest(`
							export default {
								fetch() {
									return new Response("primary");
								}
							};
						`),
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
							compatibilityDate: "2026-05-20",
							manifest: singleModuleManifest(`
								export default {
									fetch() {
										return new Response("auxiliary");
									}
								};
							`),
						},
					},
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

	it("rejects update when a worker fails to start", async ({ expect }) => {
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

		// Either of these changes should cause a startup failure
		await seed({
			".cloudflare/output/v0/workers/default/bundle/index.js": `
				export default {
					fetch() {
						return new Response("broken);
					}
				};
			`,
			".cloudflare/output/v0/workers/auxiliary-worker/bundle/index.js": `
				export default {
					fetch() {
						return new Response("broken too";
					}
				};
			`,
		});

		await expect(
			Promise.race([
				server.update((options) => options),
				setTimeout(5_000).then(() => {
					throw new Error("server.update() timed out");
				}),
			])
		).rejects.toThrow("The Workers runtime failed to start");
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

		await writeBuild(".", {
			default: {
				config: { name: "default-outbound-worker" },
				script: `
					export default {
						fetch() {
							return fetch("http://example.com");
						}
					};
				`,
			},
		});

		const server = createTestHarness({ workers: [{ buildOutput: "." }] });
		onTestFinished(server.close);

		await server.listen();

		const response = await server.fetch("/");
		await expect(response.text()).resolves.toBe("Mocked by MSW");
	});

	it("starts workers from inline config", async ({ expect }) => {
		const server = createTestHarness({
			workers: [
				{
					config: {
						name: "inline-worker",
						compatibilityDate: "2026-05-20",
						manifest: singleModuleManifest(`
							export default {
								fetch() {
									return new Response("Hello from inline config");
								}
							};
						`),
					},
				},
			],
		});
		onTestFinished(server.close);

		await server.listen();

		const response = await server.fetch("/");
		await expect(response.text()).resolves.toBe("Hello from inline config");
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

	it("lists Durable Object ids by class name or binding name", async ({
		expect,
	}) => {
		await writeBuild(".", {
			default: {
				config: {
					name: "durable-object-list-worker",
					exports: { Counter: { type: "durable-object", storage: "sqlite" } },
					env: {
						COUNTER: {
							type: "durable-object",
							worker: "durable-object-list-worker",
							exportName: "Counter",
						},
					},
				},
				script: `
					export class Counter {
						constructor(ctx) {
							this.ctx = ctx;
						}

						async fetch() {
							await this.ctx.storage.put("count", 1);
							return new Response("stored");
						}
					}

					export default {
						fetch(request, env) {
							const name = new URL(request.url).searchParams.get("name") ?? "default";
							const id = env.COUNTER.idFromName(name);
							return env.COUNTER.get(id).fetch("https://counter.example");
						}
					};
				`,
			},
		});

		const server = createTestHarness({ workers: [{ buildOutput: "." }] });
		onTestFinished(server.close);

		await server.listen();

		const worker = server.getWorker<
			{ COUNTER: DurableObjectNamespace },
			{
				default: ExportedHandler<{ COUNTER: DurableObjectNamespace }>;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Match runtime class exports by instance type.
				Counter: new (...args: any[]) => CloudflareWorkersModule.DurableObject;
			}
		>();
		const env = await worker.getEnv();
		const firstId = env.COUNTER.idFromName("first").toString();
		const secondId = env.COUNTER.idFromName("second").toString();

		await expect(worker.listDurableObjectIds("COUNTER")).resolves.toEqual([]);

		await expect(server.fetch("/?name=first")).resolves.toHaveProperty(
			"status",
			200
		);
		await expect(server.fetch("/?name=second")).resolves.toHaveProperty(
			"status",
			200
		);

		await expect(worker.listDurableObjectIds("Counter")).resolves.toEqual(
			[firstId, secondId].sort()
		);
		await expect(worker.listDurableObjectIds("COUNTER")).resolves.toEqual(
			[firstId, secondId].sort()
		);
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
		// As in production, a Worker's uncaught error is a 500 response
		const auxiliaryResponse = await server
			.getWorker("auxiliary-worker")
			.fetch("https://example.com/greet", { method: "post" });
		expect(auxiliaryResponse.status).toBe(500);
		await expect(auxiliaryResponse.text()).resolves.toContain(
			"auxiliary failed"
		);
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
