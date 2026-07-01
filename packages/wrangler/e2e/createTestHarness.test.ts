import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { mockConsoleMethods } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import dedent from "ts-dedent";
import {
	afterEach,
	beforeEach,
	describe,
	it,
	onTestFinished,
	vi,
} from "vitest";
import {
	importWrangler,
	WranglerE2ETestHelper,
} from "./helpers/e2e-wrangler-test";
import type {
	CloudflareWorkersModule,
	D1Database,
	DurableObjectNamespace,
	KVNamespace,
	R2Bucket,
} from "@cloudflare/workers-types/experimental";

const { createTestHarness } = await importWrangler();

describe("createTestHarness", () => {
	const logs = mockConsoleMethods();

	let helper: WranglerE2ETestHelper;

	function normalizeDebugOutput(output: string) {
		return String(output)
			.replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/gm, "<timestamp>")
			.replace(/http:\/\/127\.0\.0\.1:\d+/g, "http://127.0.0.1:<port>");
	}

	beforeEach(() => {
		helper = new WranglerE2ETestHelper();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	it("starts with default server options", async ({ expect, onTestFailed }) => {
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

		const server = createTestHarness({
			workers: [
				{ configPath: path.resolve(helper.tmpPath, "./wrangler.jsonc") },
			],
		});
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
		await helper.seed({
			"wrangler.jsonc": dedent`
				{
					"name": "delayed-config-worker",
					"main": "src/index.ts",
					"compatibility_date": "2026-05-20",
					"vars": { "GREETING": "initial" }
				}
			`,
			"src/index.ts": dedent`
				export default {
					fetch(_request, env) {
						return new Response(env.GREETING);
					}
				};
			`,
		});

		const server = createTestHarness();
		onTestFinished(server.close);

		await expect(server.listen()).rejects.toThrow(
			"Test harness options have not been configured."
		);

		await server.update({
			root: helper.tmpPath,
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
		await server.listen();

		const initialResponse = await server.fetch("/");
		await expect(initialResponse.text()).resolves.toBe("initial");

		await server.update((options) => ({
			...options,
			workers: options.workers.map((worker) =>
				"configPath" in worker
					? { ...worker, vars: { GREETING: "updated" } }
					: worker
			),
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

		const server = createTestHarness({
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

	it("exposes resource bindings scoped to each worker environment", async ({
		expect,
	}) => {
		await helper.seed({
			"wrangler.api.jsonc": dedent`
				{
					"name": "api-worker",
					"main": "src/api.ts",
					"compatibility_date": "2026-05-20",
					"vars": { "GREETING": "api" },
					"kv_namespaces": [
						{ "binding": "STORE", "id": "api-store" }
					],
					"r2_buckets": [
						{ "binding": "BUCKET", "bucket_name": "api-bucket" }
					]
				}
			`,
			"wrangler.admin.jsonc": dedent`
				{
					"name": "admin-worker",
					"main": "src/admin.ts",
					"compatibility_date": "2026-05-20",
					"vars": { "GREETING": "admin" },
					"d1_databases": [
						{
							"binding": "DATABASE",
							"database_name": "admin-database",
							"database_id": "00000000-0000-0000-0000-000000000002"
						}
					],
					"durable_objects": {
						"bindings": [
							{ "name": "OBJECT", "class_name": "Counter" }
						]
					},
					"migrations": [
						{ "tag": "v1", "new_sqlite_classes": ["Counter"] }
					]
				}
			`,
			"src/api.ts": dedent`
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
			"src/admin.ts": dedent`
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
		});

		const server = createTestHarness({
			root: helper.tmpPath,
			workers: [
				{
					configPath: "./wrangler.api.jsonc",
					secrets: { SECRET: "api-secret" },
				},
				{
					configPath: "./wrangler.admin.jsonc",
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

	it("introspects Workflow instances by binding name", async ({ expect }) => {
		await helper.seed({
			"wrangler.jsonc": dedent`
				{
					"name": "workflow-worker",
					"main": "src/index.ts",
					"compatibility_date": "2026-05-20",
					"workflows": [
						{
							"binding": "MODERATOR",
							"class_name": "ModeratorWorkflow",
							"name": "moderator-workflow"
						}
					]
				}
			`,
			"src/index.ts": dedent`
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
		});

		const server = createTestHarness({
			root: helper.tmpPath,
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
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
			instances[0].waitForStepResult({ name: stepName })
		).resolves.toEqual(mockResult);
		await expect(instances[0].waitForStatus("complete")).resolves.not.toThrow();
		await expect(instances[0].getOutput()).resolves.toEqual({
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
			streamInstance.waitForStatus("complete")
		).resolves.not.toThrow();
		await expect(streamInstance.getOutput()).resolves.toEqual({
			streamResult: "mock stream",
		});
	});

	it("applies D1 migrations to a worker binding", async ({ expect }) => {
		await helper.seed({
			"wrangler.jsonc": dedent`
				{
					"name": "d1-worker",
					"main": "src/index.ts",
					"compatibility_date": "2026-05-20",
					"d1_databases": [
						{
							"binding": "DATABASE",
							"database_name": "test-database",
							"database_id": "00000000-0000-0000-0000-000000000001",
							"migrations_dir": "migrations",
							"migrations_pattern": "migrations/*/migration.sql",
							"migrations_table": "custom_migrations"
						}
					]
				}
			`,
			"src/index.ts": dedent`
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
			"migrations/0001_settings/migration.sql": dedent`
				CREATE TABLE settings (
					key TEXT PRIMARY KEY,
					value TEXT NOT NULL
				);
			`,
			"migrations/0002_seed/migration.sql": dedent`
				INSERT INTO settings (key, value) VALUES ('greeting', 'Hello D1');
			`,
		});

		const server = createTestHarness({
			root: helper.tmpPath,
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
		onTestFinished(server.close);

		await server.listen();

		const worker = server.getWorker<{ DATABASE: D1Database }>();
		await worker.applyD1Migrations("DATABASE");

		const response = await worker.fetch("/greeting");
		await expect(response.text()).resolves.toBe("Hello D1");

		await worker.applyD1Migrations("DATABASE");
		const secondResponse = await worker.fetch("/greeting");
		await expect(secondResponse.text()).resolves.toBe("Hello D1");

		server.debug();
		const debugOutput = normalizeDebugOutput(logs.getAndClearOut());
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

	it("supports service bindings between workers", async ({ expect }) => {
		await helper.seed({
			"wrangler.primary.jsonc": dedent`
				{
					"name": "primary-worker",
					"main": "src/primary.ts",
					"compatibility_date": "2026-05-20",
					"services": [
						{ "binding": "AUXILIARY", "service": "auxiliary-worker" }
					]
				}
			`,
			"wrangler.auxiliary.jsonc": dedent`
				{
					"name": "auxiliary-worker",
					"main": "src/auxiliary.ts",
					"compatibility_date": "2026-05-20",
					"services": [
						{ "binding": "PRIMARY", "service": "primary-worker" }
					]
				}
			`,
			"src/primary.ts": dedent`
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
			"src/auxiliary.ts": dedent`
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
		});

		const server = createTestHarness({
			root: helper.tmpPath,
			workers: [
				{ configPath: "./wrangler.primary.jsonc" },
				{ configPath: "./wrangler.auxiliary.jsonc" },
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
		await helper.seed({
			"wrangler.app.jsonc": dedent`
				{
					"name": "app-worker",
					"main": "src/app.ts",
					"compatibility_date": "2026-05-20",
					"ai": { "binding": "AI" }
				}
			`,
			"src/app.ts": dedent`
				export default {
					async fetch(_request, env) {
						return Response.json(await env.AI.run("@cf/test/model", {
							prompt: "What should the test return?"
						}));
					}
				};
			`,
			"src/mock-ai.ts": dedent`
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
		});

		const server = createTestHarness({
			root: helper.tmpPath,
			workers: [
				{
					configPath: "./wrangler.app.jsonc",
					bindingOverrides: {
						AI: "mock-ai",
					},
				},
				{
					config: {
						name: "mock-ai",
						main: "src/mock-ai.ts",
						compatibility_date: "2026-05-20",
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
		await helper.seed({
			"wrangler.jsonc": dedent`
				{
					"name": "rpc-worker",
					"main": "src/index.ts",
					"compatibility_date": "2026-05-20"
				}
			`,
			"src/index.ts": dedent`
				import { WorkerEntrypoint } from "cloudflare:workers";

				export default class RpcWorker extends WorkerEntrypoint {
					getMessage(name) {
						return "Hello " + name;
					}
				}
			`,
		});

		const server = createTestHarness({
			root: helper.tmpPath,
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
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
		await helper.seed({
			"wrangler.jsonc": dedent`
				{
					"name": "app-worker",
					"main": "src/index.ts",
					"compatibility_date": "2026-05-20",
					"ai": { "binding": "AI" }
				}
			`,
			"src/index.ts": dedent`
				export default {
					async fetch(_request, env) {
						return Response.json(await env.AI.run("@cf/test/model", {}));
					}
				};
			`,
		});

		const server = createTestHarness({
			root: helper.tmpPath,
			workers: [
				{
					configPath: "./wrangler.jsonc",
					bindingOverrides: { AI: "missing-ai" },
				},
			],
		});
		onTestFinished(server.close);

		await expect(server.listen()).rejects.toThrow("core:user:missing-ai");
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

		const server = createTestHarness({
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

		const server = createTestHarness({
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

		let workerCountAfterRejectedUpdate = 0;
		await server.update((options) => {
			workerCountAfterRejectedUpdate = options.workers.length;
			return options;
		});

		expect(workerCountAfterRejectedUpdate).toBe(1);
	});

	it("rejects update when a worker fails to build", async ({ expect }) => {
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

		const server = createTestHarness({
			root: helper.tmpPath,
			workers: [
				{ configPath: "./wrangler.primary.jsonc" },
				{ configPath: "./wrangler.auxiliary.jsonc" },
			],
		});
		onTestFinished(server.close);

		await server.listen();

		// Either of these changes should cause a build failure
		await helper.seed({
			"src/primary.ts": dedent`
				export default {
					fetch() {
						return new Response("broken);
					}
				};
			`,
			"src/auxiliary.ts": dedent`
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
		).rejects.toThrow("Build failed");
	});

	it("rejects calls on unknown worker handles", async ({ expect }) => {
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

		const server = createTestHarness({
			root: helper.tmpPath,
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
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

		const server = createTestHarness({
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

		const server = createTestHarness({
			root: helper.tmpPath,
			workers: [
				{
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

		const server = createTestHarness({
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

		const server = createTestHarness({
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

		const server = createTestHarness({
			root: helper.tmpPath,
			workers: [
				{
					configPath: "./wrangler.jsonc",
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
			root: helper.tmpPath,
			workers: [
				{
					configPath: "./wrangler.jsonc",
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

		const server = createTestHarness({
			root: helper.tmpPath,
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
		onTestFinished(server.close);

		await server.listen();

		const response = await server.fetch("/");
		await expect(response.text()).resolves.toBe("function");
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

		const firstServer = createTestHarness({
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

		const secondServer = createTestHarness({
			root: helper.tmpPath,
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
		onTestFinished(secondServer.close);

		await secondServer.listen();

		const resetResponse = await secondServer.fetch("/");
		await expect(resetResponse.text()).resolves.toBe("missing");
	});

	it("resets server options and restarts the session", async ({ expect }) => {
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

		const server = createTestHarness({
			root: helper.tmpPath,
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
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

		const server = createTestHarness({
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

		server.debug();
		expect(normalizeDebugOutput(logs.getAndClearOut())).toMatchInlineSnapshot(`
			"--------------- debug logs ---------------
			<timestamp> [server] startup - started
			<timestamp> [server] startup - completed
			<timestamp> [server] fetch - GET / - started
			<timestamp> [server] fetch - GET / - 200
			<timestamp> [server] [scheduled-worker] scheduled - GET /cdn-cgi/handler/scheduled?format=json&cron=*+*+*+*+*&time=1700000100000 - started
			<timestamp> [server] [scheduled-worker] scheduled - GET /cdn-cgi/handler/scheduled?format=json&cron=*+*+*+*+*&time=1700000100000 - 200
			<timestamp> [server] fetch - GET / - started
			<timestamp> [server] fetch - GET / - 200"
		`);
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

		const server = createTestHarness({
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

		await helper.seed({
			"src/index.ts": dedent`
				export default {
					fetch() {
						return new Response("Bonjour");
					}
				};
			`,
		});

		await setTimeout(1000);

		const response3 = await server.fetch("/");
		await expect(response3.text()).resolves.toBe("Hello World");
	});

	it("captures runtime logs and prints debug timelines", async ({ expect }) => {
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
						console.info("primary log");
						return new Response("primary ok");
					}
				};
			`,
			"src/auxiliary.ts": dedent`
				export default {
					fetch() {
						console.warn("auxiliary warning");
						throw new Error("auxiliary failed");
					}
				};
			`,
		});

		const server = createTestHarness({
			root: helper.tmpPath,
			workers: [
				{ configPath: "./wrangler.primary.jsonc" },
				{ configPath: "./wrangler.auxiliary.jsonc" },
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
		await expect(
			server
				.getWorker("auxiliary-worker")
				.fetch("https://example.com/greet", { method: "post" })
		).rejects.toThrow("auxiliary failed");
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
			<timestamp> [server] [auxiliary-worker] fetch - POST https://example.com/greet - failed"
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
			<timestamp> [server] [auxiliary-worker] fetch - POST https://example.com/greet - failed"
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
