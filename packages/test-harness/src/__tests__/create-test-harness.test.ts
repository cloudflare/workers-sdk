import { execFileSync } from "node:child_process";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import {
	getWorkerAssetsDir,
	getWorkerBundleDir,
	writeContainerConfig,
	writeRootConfig,
	writeWorkerConfig,
} from "@cloudflare/build-output-utils";
import { bindings, defineConfig } from "@cloudflare/config";
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
import {
	beforeEach,
	describe,
	expectTypeOf,
	it,
	onTestFinished,
	vi,
} from "vitest";
import { createTestHarness } from "../index";
import type {
	WriteContainerConfigOptions,
	WriteWorkerConfigOptions,
} from "@cloudflare/build-output-utils";
import type { CloudflareWorkersModule } from "@cloudflare/workers-types";

// Starting a real session needs Cloudflare credentials
vi.mock("@cloudflare/remote-bindings", () => ({
	maybeStartOrUpdateRemoteProxySession: vi.fn(),
}));

// As the Vite plugin's container tests: images are linux/amd64, which CI
// runs on Linux only, and local runs need Docker
const canRunContainers =
	process.env.LOCAL_TESTS_WITHOUT_DOCKER !== "true" &&
	(process.env.CI === "true"
		? process.platform === "linux"
		: await isDockerRunning(getDockerPath()));

/**
 * Writes a project's Build Output with the writers that build tools use.
 *
 * @param options.projectDir The project directory
 * @param options.workers The Workers, keyed by their directory under `workers/`
 * @param options.containers The Containers, keyed by their directory under `containers/`
 * @param options.mode The mode the build ran in
 */
async function writeBuild({
	projectDir,
	workers,
	containers = {},
	mode = "production",
}: {
	projectDir: string;
	workers: Record<
		string,
		{
			// Without a compatibility date, the Worker gets a default one
			config: Omit<WriteWorkerConfigOptions["config"], "compatibilityDate"> & {
				compatibilityDate?: string;
			};
			script?: string;
			assets?: Record<string, string>;
		}
	>;
	containers?: Record<string, WriteContainerConfigOptions["config"]>;
	mode?: string;
}) {
	await writeRootConfig({
		root: projectDir,
		buildContext: { isPreview: false, mode },
	});
	for (const [directoryName, worker] of Object.entries(workers)) {
		await writeWorkerConfig({
			root: projectDir,
			directoryName,
			config: { compatibilityDate: "2026-10-01", ...worker.config },
			manifest:
				worker.script === undefined
					? undefined
					: { type: "partial", mainModule: "index.js", modules: {} },
		});
		const files: Record<string, string> = {};
		if (worker.script !== undefined) {
			const bundleDir = getWorkerBundleDir(projectDir, directoryName);
			files[path.join(bundleDir, "index.js")] = worker.script;
		}
		const assetsDir = getWorkerAssetsDir(projectDir, directoryName);
		for (const [name, contents] of Object.entries(worker.assets ?? {})) {
			files[path.join(assetsDir, name)] = contents;
		}
		await seed(files);
	}
	for (const [directoryName, config] of Object.entries(containers)) {
		await writeContainerConfig({ root: projectDir, directoryName, config });
	}
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

describe("createTestHarness", () => {
	const logs = mockConsoleMethods();
	runInTempDir();
	beforeEach(() => {
		vi.mocked(maybeStartOrUpdateRemoteProxySession).mockResolvedValue(null);
	});

	function normalizeDebugOutput(output: string) {
		return String(output)
			.replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/gm, "<timestamp>")
			.replace(/http:\/\/127\.0\.0\.1:\d+/g, "http://127.0.0.1:<port>");
	}

	it("starts with default server options", async ({ expect, onTestFailed }) => {
		await writeBuild({
			projectDir: ".",
			workers: {
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
					assets: { "style.css": "body { color: red; }" },
				},
			},
		});

		const server = createTestHarness({ workers: [{ projectDir: "." }] });
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

		const assetResponse = await server.fetch("/style.css");
		await expect(assetResponse.text()).resolves.toBe("body { color: red; }");
	});

	it("runs an assets-only Worker", async ({ expect }) => {
		await writeBuild({
			projectDir: "app",
			workers: {
				default: {
					config: { name: "app" },
					assets: { "index.html": "<h1>Hello</h1>" },
				},
			},
		});
		const harness = createTestHarness({ workers: [{ projectDir: "app" }] });
		onTestFinished(harness.close);

		await harness.listen();
		expect(await (await harness.fetch("/")).text()).toBe("<h1>Hello</h1>");
	});

	it.skipIf(!canRunContainers)(
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

			await writeBuild({
				projectDir: ".",
				workers: {
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
				},
				containers: {
					sandbox: {
						name: "sandbox",
						maxInstances: 20,
						image: { localReference: image },
					},
				},
			});
			const harness = createTestHarness({ workers: [{ projectDir: "." }] });
			onTestFinished(harness.close);

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
		await writeBuild({
			projectDir: "app",
			workers: {
				default: {
					config: {
						name: "app",
						env: {
							TOKEN: { type: "secret" },
							API_KEY: { type: "secret" },
							GREETING: { type: "text", value: "Hello" },
							EXTRA: { type: "json", value: {} },
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
			mode: "staging",
		});
		await seed({
			"app/.dev.vars.production": "TOKEN=production\nAPI_KEY=production",
			"app/.dev.vars.staging": "TOKEN=staging",
		});
		const harness = createTestHarness({
			workers: [
				{
					projectDir: "app",
					envOverrides: {
						API_KEY: bindings.text("from-test"),
						GREETING: bindings.text("Hi"),
						EXTRA: bindings.json({ nested: true }),
					},
				},
			],
		});
		onTestFinished(harness.close);

		await harness.listen();
		expect(await (await harness.fetch("/")).json()).toEqual({
			TOKEN: "staging",
			API_KEY: "from-test",
			GREETING: "Hi",
			EXTRA: { nested: true },
		});
	});

	it("runs Workers from several builds, each with its project's secrets, picking non-default ones by name", async ({
		expect,
	}) => {
		await writeBuild({
			projectDir: "./apps/frontend",
			workers: {
				default: {
					config: {
						name: "frontend",
						env: {
							API: { type: "worker", worker: "api" },
							SECRET: { type: "secret" },
						},
					},
					script: `export default {
					async fetch(request, env) {
						return new Response("frontend " + env.SECRET + " -> " + (await (await env.API.fetch(request)).text()));
					},
				};`,
				},
			},
		});
		await writeBuild({
			projectDir: "./apps/backend",
			workers: {
				default: {
					config: { name: "api", env: { SECRET: { type: "secret" } } },
					script: `export default { fetch(request, env) { return new Response("api " + env.SECRET); } };`,
				},
				// Build tools lowercase the folder name
				admin: {
					config: { name: "Admin" },
					script: `export default { fetch() { return new Response("admin"); } };`,
				},
			},
		});
		// Each Worker reads the files in its own project
		await seed({
			"apps/frontend/.env": "SECRET=from-frontend",
			"apps/backend/.dev.vars": "SECRET=from-backend",
		});

		// A project resolves from `root`, or is a `file:` URL
		const harness = createTestHarness({
			root: "apps",
			workers: [
				{ projectDir: "frontend" },
				{ projectDir: pathToFileURL(path.resolve("apps/backend")) },
				{ projectDir: "backend", name: "Admin" },
			],
		});
		onTestFinished(harness.close);
		await harness.listen();
		expect(await (await harness.fetch("/")).text()).toBe(
			"frontend from-frontend -> api from-backend"
		);
		expect(await (await harness.getWorker("Admin").fetch("/")).text()).toBe(
			"admin"
		);

		const missing = createTestHarness({
			workers: [{ projectDir: "./apps/backend", name: "missing" }],
		});
		onTestFinished(missing.close);
		await expect(missing.listen()).rejects.toThrow(
			'No Worker named "missing" in the Build Output'
		);
	});

	it("connects remote bindings through a remote session", async ({
		expect,
	}) => {
		const session = { dispose: vi.fn() };
		// Only the Build Output Worker has remote bindings
		vi.mocked(maybeStartOrUpdateRemoteProxySession).mockImplementation(
			async ({ name }) =>
				(name === "app" ? { session } : null) as unknown as Awaited<
					ReturnType<typeof maybeStartOrUpdateRemoteProxySession>
				>
		);
		const env = {
			KV: { type: "kv" as const, id: "abc", dev: { remote: true } },
		};
		await writeBuild({
			projectDir: "app",
			workers: {
				default: {
					config: {
						name: "app",
						env: {
							...env,
							CACHE: { type: "kv", id: "def", dev: { remote: true } },
						},
					},
					script: `export default { fetch() { return new Response("ok"); } };`,
				},
			},
		});
		const harness = createTestHarness({
			workers: [
				{
					projectDir: "app",
					// A local namespace in place of the remote one
					envOverrides: { CACHE: bindings.kv() },
				},
			],
		});

		await harness.listen();
		// `envOverrides` replaces bindings before the session starts, so a
		// replaced remote binding never reaches it
		expect(maybeStartOrUpdateRemoteProxySession).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "app",
				target: "cf",
				env: { ...env, CACHE: { type: "kv" } },
			}),
			null,
			expect.objectContaining({ hook: expect.any(Function) }),
			expect.objectContaining({ cliDisplayName: "cf" })
		);
		// update() updates the Worker's session rather than starting another,
		// even when another Worker now comes first
		await harness.update((options) => ({
			...options,
			workers: [
				{
					config: {
						name: "mock",
						compatibilityDate: "2026-05-20",
						manifest: singleModuleManifest("export default {};"),
					},
				},
				...options.workers,
			],
		}));
		expect(maybeStartOrUpdateRemoteProxySession).toHaveBeenLastCalledWith(
			expect.objectContaining({ name: "app" }),
			{ session },
			expect.anything(),
			expect.anything()
		);
		expect(session.dispose).not.toHaveBeenCalled();
		// Replacing the Worker with an inline one of the same name disposes its
		// session, as removing it does
		await harness.update((options) => ({
			...options,
			workers: [
				...options.workers.slice(0, 1),
				{
					config: {
						name: "app",
						compatibilityDate: "2026-05-20",
						manifest: singleModuleManifest("export default {};"),
					},
				},
			],
		}));
		expect(session.dispose).toHaveBeenCalledTimes(1);
		await harness.close();
	});

	it("disposes the remote sessions when the runtime fails to start", async ({
		expect,
	}) => {
		const session = { dispose: vi.fn() };
		vi.mocked(maybeStartOrUpdateRemoteProxySession).mockResolvedValue({
			session,
		} as unknown as Awaited<
			ReturnType<typeof maybeStartOrUpdateRemoteProxySession>
		>);
		await writeBuild({
			projectDir: "app",
			workers: {
				default: {
					config: { name: "app" },
					script: `export default {`,
				},
			},
		});
		const harness = createTestHarness({ workers: [{ projectDir: "app" }] });
		onTestFinished(harness.close);

		await expect(harness.listen()).rejects.toThrow();
		expect(session.dispose).toHaveBeenCalled();

		// Or when a later Worker can't be resolved
		session.dispose.mockClear();
		await writeBuild({
			projectDir: "working",
			workers: {
				default: {
					config: { name: "working" },
					script: `export default {};`,
				},
			},
		});
		const unresolved = createTestHarness({
			workers: [{ projectDir: "working" }, { projectDir: "missing" }],
		});
		onTestFinished(unresolved.close);
		await expect(unresolved.listen()).rejects.toThrow();
		expect(session.dispose).toHaveBeenCalled();

		// A Worker's modules are read before its session starts, so one that
		// can't be read starts none
		vi.mocked(maybeStartOrUpdateRemoteProxySession).mockClear();
		await writeRootConfig({
			root: "unreadable",
			buildContext: { isPreview: false, mode: "production" },
		});
		await writeWorkerConfig({
			root: "unreadable",
			directoryName: "default",
			config: { name: "unreadable", compatibilityDate: "2026-10-01" },
			manifest: {
				type: "complete",
				mainModule: "index.js",
				modules: { "index.js": { type: "esm" } },
			},
		});
		// The bundle doesn't have the module its manifest lists
		await seed({
			[path.join(getWorkerBundleDir("unreadable"), "other.js")]: "",
		});
		const unreadable = createTestHarness({
			workers: [{ projectDir: "unreadable" }],
		});
		onTestFinished(unreadable.close);
		await expect(unreadable.listen()).rejects.toThrow();
		expect(maybeStartOrUpdateRemoteProxySession).not.toHaveBeenCalled();
	});

	it("can be configured after creation, and reset to its starting options and storage", async ({
		expect,
	}) => {
		await writeBuild({
			projectDir: ".",
			workers: {
				default: {
					config: {
						name: "delayed-config-worker",
						env: {
							GREETING: { type: "text", value: "initial" },
							STORE: { type: "kv", id: "test-store" },
						},
					},
					script: `
					export default {
						async fetch(request, env) {
							if (new URL(request.url).pathname === "/set") {
								await env.STORE.put("key", "value");
							}
							return new Response(env.GREETING + " " + ((await env.STORE.get("key")) ?? "missing"));
						}
					};
				`,
				},
			},
		});

		const server = createTestHarness();
		onTestFinished(server.close);

		await expect(server.listen()).rejects.toThrow(
			"Test harness options have not been configured."
		);
		await expect(server.reset()).rejects.toThrow(
			"Test harness has not been started. Start it with harness.listen() before calling this method."
		);

		await server.update({ workers: [{ projectDir: "." }] });
		await server.listen();

		const initialResponse = await server.fetch("/");
		await expect(initialResponse.text()).resolves.toBe("initial missing");

		await server.update((options) => ({
			...options,
			workers: options.workers.map((worker) => ({
				...worker,
				envOverrides: { GREETING: bindings.text("updated") },
			})),
		}));

		const updatedResponse = await server.fetch("/set");
		await expect(updatedResponse.text()).resolves.toBe("updated value");

		await server.reset();

		const resetResponse = await server.fetch("/");
		await expect(resetResponse.text()).resolves.toBe("initial missing");
	});

	it("accesses Durable Objects by export name", async ({
		expect,
		onTestFailed,
	}) => {
		await writeBuild({
			projectDir: ".",
			workers: {
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

						fetch() {
							this.memoryCount += 1;
							this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY)");
							this.ctx.storage.sql.exec("INSERT INTO visits DEFAULT VALUES");
							const { count } = this.ctx.storage.sql.exec("SELECT COUNT(*) AS count FROM visits").one();
							return Response.json({ memoryCount: this.memoryCount, storageCount: count });
						}
					}

					export default {
						fetch(request, env) {
							const id = env.COUNTER.idFromName(new URL(request.url).searchParams.get("name"));
							return env.COUNTER.get(id).fetch(request);
						}
					};
				`,
				},
			},
		});

		const server = createTestHarness({ workers: [{ projectDir: "." }] });
		onTestFinished(server.close);
		onTestFailed(server.debug);

		await server.listen();

		const worker = server.getWorker();
		await expect(worker.listDurableObjectIds("Counter")).resolves.toEqual([]);

		const storage = await worker.getDurableObjectStorage("Counter", {
			name: "user-123",
		});
		await storage.exec("CREATE TABLE visits (id INTEGER PRIMARY KEY)");
		await storage.exec("INSERT INTO visits DEFAULT VALUES");

		const response1 = await worker.fetch("/?name=user-123");
		expect(await response1.json()).toEqual({
			memoryCount: 1,
			storageCount: 2,
		});

		await worker.evictDurableObject("Counter", { name: "user-123" });

		const response2 = await worker.fetch("/?name=user-123");
		expect(await response2.json()).toEqual({
			memoryCount: 1,
			storageCount: 3,
		});

		const env = await worker.getEnv();
		await expect(worker.listDurableObjectIds("Counter")).resolves.toEqual([
			env.COUNTER.idFromName("user-123").toString(),
		]);

		// Not by binding name
		await expect(
			worker.getDurableObjectStorage("COUNTER", { name: "user-123" })
		).rejects.toThrow(
			'No Durable Object class named "COUNTER" found in "do-worker" worker.'
		);
		await expect(worker.listDurableObjectIds("COUNTER")).rejects.toThrow(
			'No Durable Object class named "COUNTER" found in "do-worker" worker.'
		);
	});

	it("only replaces a binding with one that can stand in for it", async ({
		expect,
	}) => {
		await writeBuild({
			projectDir: ".",
			workers: {
				default: {
					config: {
						name: "app",
						exports: {
							TestObject: { type: "durable-object", storage: "sqlite" },
						},
						env: {
							GREETING: { type: "text", value: "Hello" },
							AI: { type: "ai" },
							OBJECT: {
								type: "durable-object",
								worker: "app",
								exportName: "TestObject",
							},
						},
					},
					script: `
					import { DurableObject } from "cloudflare:workers";
					export class TestObject extends DurableObject {}
					export default {};
				`,
				},
			},
		});

		for (const [envOverrides, message] of [
			// As in production, a Worker only has the bindings it declares
			[
				{ ADDED: bindings.text("added") },
				'`envOverrides` names "ADDED", which isn\'t a binding of Worker "app". It has: GREETING, AI, OBJECT.',
			],
			[
				{ GREETING: bindings.kv() },
				'`envOverrides` can\'t replace binding "GREETING" of type "text" with one of type "kv". Use `bindings.text()` or `bindings.json()`.',
			],
			[
				{ AI: bindings.text("mock") },
				'`envOverrides` can\'t replace binding "AI" of type "ai" with one of type "text". Use type "ai", or `bindings.worker()` to mock it.',
			],
			[
				{ OBJECT: bindings.worker({ worker: "mock" }) },
				'`envOverrides` can\'t replace binding "OBJECT" of type "durable-object" with one of type "worker". Use another Durable Object binding.',
			],
		] as const) {
			const server = createTestHarness({
				workers: [{ projectDir: ".", envOverrides }],
			});
			onTestFinished(server.close);
			await expect(server.listen()).rejects.toThrow(message);
		}
	});

	it("introspects Workflow instances by export name", async ({ expect }) => {
		await writeBuild({
			projectDir: ".",
			workers: {
				default: {
					config: {
						name: "workflow-worker",
						exports: {
							ModeratorWorkflow: {
								type: "workflow",
								name: "moderator-workflow",
							},
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
						run(event, step) {
							return step.do("AI content scan", () => "scanned");
						}
					}

					export default {
						async fetch(request, env) {
							const id = new URL(request.url).searchParams.get("id");
							const workflow = await env.MODERATOR.create({ id });
							return Response.json({ id: workflow.id });
						}
					};
				`,
				},
			},
		});

		const server = createTestHarness({ workers: [{ projectDir: "." }] });
		onTestFinished(server.close);

		await server.listen();

		const worker = server.getWorker("workflow-worker");
		const step = { name: "AI content scan" };

		const instance = await worker.introspectWorkflowInstance(
			"ModeratorWorkflow",
			"known"
		);
		onTestFinished(instance.dispose);
		await instance.modify(async (modifier) => {
			await modifier.mockStepResult(step, "mocked");
		});
		await worker.fetch("/?id=known");
		await instance.waitForStatus("complete");
		await expect(instance.getOutput()).resolves.toBe("mocked");

		const workflow = await worker.introspectWorkflow("ModeratorWorkflow");
		onTestFinished(workflow.dispose);
		await workflow.modifyAll(async (modifier) => {
			await modifier.mockStepResult(step, "mocked");
		});
		await worker.fetch("/?id=other");
		const instances = await workflow.get();
		expect(instances).toHaveLength(1);
		await instances[0]?.waitForStatus("complete");
		await expect(instances[0]?.getOutput()).resolves.toBe("mocked");
	});

	it("applies D1 migrations to a worker binding", async ({ expect }) => {
		await writeBuild({
			projectDir: "app",
			workers: {
				default: {
					config: { name: "d1-worker", env: { DATABASE: { type: "d1" } } },
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
			},
		});
		await seed({
			"app/migrations/0001_settings/migration.sql":
				"CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
			"app/migrations/0002_seed/migration.sql":
				"INSERT INTO settings (key, value) VALUES ('greeting', 'Hello D1');",
		});

		const server = createTestHarness({ workers: [{ projectDir: "app" }] });
		onTestFinished(server.close);

		await server.listen();

		const worker = server.getWorker();
		// Build Output has no migrations config, so the test passes it. `dir`
		// defaults to `migrations`, in the Worker's project directory.
		const migrationsOptions = {
			pattern: "migrations/*/migration.sql",
			table: "custom_migrations",
		};
		await worker.applyD1Migrations("DATABASE", migrationsOptions);

		const response = await worker.fetch("/greeting");
		await expect(response.text()).resolves.toBe("Hello D1");

		await worker.applyD1Migrations("DATABASE", migrationsOptions);
		const secondResponse = await worker.fetch("/greeting");
		await expect(secondResponse.text()).resolves.toBe("Hello D1");

		server.debug();
		const debugOutput = normalizeDebugOutput(logs.getAndClearOut());
		expect(debugOutput).toContain(
			"[server] [d1-worker] d1 migrations - DATABASE - completed (2 found)"
		);
	});

	it("supports binding overrides for first-party bindings", async ({
		expect,
	}) => {
		await writeBuild({
			projectDir: ".",
			workers: {
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
			},
		});

		const server = createTestHarness({
			workers: [
				{
					projectDir: ".",
					envOverrides: {
						AI: bindings.worker({ worker: "mock-ai" }),
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
		await writeBuild({
			projectDir: ".",
			workers: {
				default: {
					config: {
						name: "rpc-worker",
						env: { GREETING: { type: "text", value: "Hello" } },
					},
					script: `
					import { WorkerEntrypoint } from "cloudflare:workers";

					export default class RpcWorker extends WorkerEntrypoint {
						getMessage(name) {
							return "Hello " + name;
						}
					}
				`,
				},
			},
		});

		const server = createTestHarness({ workers: [{ projectDir: "." }] });
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
		// What `typeof import("./cloudflare.config")` gives
		const config = defineConfig({
			worker: {
				name: "rpc-worker",
				compatibilityDate: "2026-10-01",
				entrypoint: {} as RpcWorkerModule,
				env: { GREETING: bindings.text("Hello") },
			},
		});
		const rpcWorker = server.getWorker<{ default: typeof config }>(
			"rpc-worker"
		);
		const rpcExport = await rpcWorker.getExport();

		expect(await rpcExport.getMessage("World")).toBe("Hello World");
		expectTypeOf<
			Awaited<ReturnType<typeof rpcExport.getMessage>>
		>().toEqualTypeOf<string>();
		const env = await rpcWorker.getEnv();
		expect(env.GREETING).toBe("Hello");
		expectTypeOf(env.GREETING).toEqualTypeOf<"Hello">();

		// Without a config module, the env and export are `any`, or the types the
		// test gives
		const untypedWorker = server.getWorker("rpc-worker");
		expectTypeOf(await untypedWorker.getEnv()).toBeAny();
		expectTypeOf(await untypedWorker.getExport()).toBeAny();
		expectTypeOf(
			await untypedWorker.getEnv<{ GREETING: string }>()
		).toEqualTypeOf<{ GREETING: string }>();
		const typedExport = await untypedWorker.getExport<{
			getMessage(name: string): string;
		}>();
		expectTypeOf<
			Awaited<ReturnType<typeof typedExport.getMessage>>
		>().toEqualTypeOf<string>();
	});

	it("routes fetches based on worker routes", async ({ expect }) => {
		await writeBuild({
			projectDir: ".",
			workers: {
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
			},
		});
		const auxiliaryManifest = singleModuleManifest(`
			export default {
				fetch(request) {
					return Response.json({ name: "auxiliary", url: request.url });
				}
			};
		`);

		const server = createTestHarness({
			workers: [
				{ projectDir: "." },
				{
					config: {
						name: "auxiliary-worker",
						compatibilityDate: "2026-05-20",
						triggers: [{ type: "fetch", pattern: "auxiliary.example.com/*" }],
						manifest: auxiliaryManifest,
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
				{ projectDir: "." },
				{
					config: {
						name: "auxiliary-worker",
						compatibilityDate: "2026-05-20",
						triggers: [
							{ type: "fetch", pattern: "updated-auxiliary.example.com/*" },
						],
						manifest: auxiliaryManifest,
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

	it("updates the number of workers", async ({ expect }) => {
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

		await server.update((options) => ({
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
		}));
		const auxiliaryResponse = await server
			.getWorker("auxiliary-worker")
			.fetch("/");
		await expect(auxiliaryResponse.text()).resolves.toBe("auxiliary");

		await server.update((options) => ({
			...options,
			workers: options.workers.slice(0, 1),
		}));
		await expect(
			server.getWorker("auxiliary-worker").fetch("/")
		).rejects.toThrow(
			'Worker "auxiliary-worker" does not exist in this server.'
		);
	});

	it("rejects update when a worker fails to start", async ({ expect }) => {
		await writeBuild({
			projectDir: ".",
			workers: {
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
			},
		});

		const server = createTestHarness({
			workers: [
				{ projectDir: "." },
				{ projectDir: ".", name: "auxiliary-worker" },
			],
		});
		onTestFinished(server.close);

		await server.listen();

		// Either of these changes should cause a startup failure
		await seed({
			[path.join(getWorkerBundleDir("."), "index.js")]: `
				export default {
					fetch() {
						return new Response("broken);
					}
				};
			`,
			[path.join(getWorkerBundleDir(".", "auxiliary-worker"), "index.js")]: `
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

	it("uses the current Node process fetch for outbound requests by default", async ({
		expect,
	}) => {
		const mockServer = setupServer(
			http.get("http://example.com/", ({ request }) => {
				// As in production, CF-Worker names the zone of the Worker's route
				return HttpResponse.text(
					`Mocked by MSW for ${request.headers.get("CF-Worker")}`
				);
			})
		);
		mockServer.listen({ onUnhandledRequest: "error" });
		onTestFinished(() => mockServer.close());

		await writeBuild({
			projectDir: ".",
			workers: {
				default: {
					config: {
						name: "default-outbound-worker",
						triggers: [{ type: "fetch", pattern: "shop.example.com/*" }],
					},
					script: `
					export default {
						fetch() {
							return fetch("http://example.com");
						}
					};
				`,
				},
			},
		});

		const server = createTestHarness({ workers: [{ projectDir: "." }] });
		onTestFinished(server.close);

		await server.listen();

		const response = await server.fetch("/");
		await expect(response.text()).resolves.toBe(
			"Mocked by MSW for shop.example.com"
		);
	});

	it("uses ephemeral storage by default", async ({ expect }) => {
		await writeBuild({
			projectDir: ".",
			workers: {
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
			},
		});

		const firstServer = createTestHarness({ workers: [{ projectDir: "." }] });
		onTestFinished(firstServer.close);

		await firstServer.listen();

		const setResponse = await firstServer.fetch("/set");
		await expect(setResponse.text()).resolves.toBe("stored");

		const storedResponse = await firstServer.fetch("/");
		await expect(storedResponse.text()).resolves.toBe("value");

		await firstServer.close();

		const secondServer = createTestHarness({ workers: [{ projectDir: "." }] });
		onTestFinished(secondServer.close);

		await secondServer.listen();

		const resetResponse = await secondServer.fetch("/");
		await expect(resetResponse.text()).resolves.toBe("missing");
	});

	it("triggers scheduled handlers", async ({ expect }) => {
		await writeBuild({
			projectDir: ".",
			workers: {
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
			},
		});

		const server = createTestHarness({ workers: [{ projectDir: "." }] });
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
		expect(normalizeDebugOutput(logs.getAndClearOut())).toMatchInlineSnapshot(`
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
		await writeBuild({
			projectDir: ".",
			workers: {
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
								\`From: reply-\${mode}@example.com\\r\\nTo: \${message.from}\\r\\nIn-Reply-To: <\${mode}@example.com>\\r\\nMessage-ID: <reply-\${mode}@example.com>\\r\\nContent-Type: text/plain\\r\\n\\r\\nReply for \${mode}\\r\\n\`
							));

							if (mode === "exception") {
								message.setReject("triggered exception");
								throw new Error("sensitive handler error");
							}
						}
					};
				`,
				},
			},
		});

		const server = createTestHarness({ workers: [{ projectDir: "." }] });
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

	it("captures runtime logs and prints debug timelines", async ({ expect }) => {
		await writeBuild({
			projectDir: ".",
			workers: {
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
			},
		});

		const server = createTestHarness({
			workers: [
				{ projectDir: "." },
				{ projectDir: ".", name: "auxiliary-worker" },
			],
		});
		onTestFinished(server.close);

		server.debug();

		expect(logs.getAndClearOut()).toMatchInlineSnapshot(
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
		expect(normalizeDebugOutput(logs.getAndClearOut())).toMatchInlineSnapshot(`
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
		expect(normalizeDebugOutput(logs.getAndClearOut())).toMatchInlineSnapshot(`
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
		expect(normalizeDebugOutput(logs.getAndClearOut())).toMatchInlineSnapshot(`
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
		expect(normalizeDebugOutput(logs.getAndClearOut())).toMatchInlineSnapshot(`
			"--------------- debug logs ---------------
			<timestamp> [server] startup - started
			<timestamp> [server] startup - completed
			<timestamp> [server] update - started
			<timestamp> [server] update - completed"
		`);

		// Make sure debug logs are still visible after server is closed
		await server.close();

		server.debug();
		expect(normalizeDebugOutput(logs.getAndClearOut())).toMatchInlineSnapshot(`
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
