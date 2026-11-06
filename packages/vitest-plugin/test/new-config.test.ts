import fs from "node:fs/promises";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import dedent from "ts-dedent";
import { beforeEach, describe, it, vi } from "vitest";
import { test, vitestConfig } from "./helpers";
import type { RemoteProxyConnectionString } from "miniflare";
import type { TestProject } from "vitest/node";

const remoteProxyConnectionString = new URL(
	"http://localhost:8787"
) as RemoteProxyConnectionString;

const {
	maybeStartOrUpdateRemoteProxySession,
	requireAuth,
	resolveProfile,
	state,
} = vi.hoisted(() => ({
	maybeStartOrUpdateRemoteProxySession: vi.fn(),
	requireAuth: vi.fn(async () => "cf-account-id"),
	resolveProfile: vi.fn(() => ({ name: "cf-profile" })),
	state: { wranglerImported: false },
}));

vi.mock("@cloudflare/remote-bindings", () => ({
	maybeStartOrUpdateRemoteProxySession,
}));

vi.mock("@cloudflare/workers-auth/cf", () => ({
	createCfAuth: () => ({
		setProfile: vi.fn(),
		requireAuth,
		requireApiToken: () => ({ apiToken: "cf-token" }),
	}),
	createCfProfileStore: () => ({ resolve: resolveProfile }),
}));

const worker = dedent`
	export default {
		async fetch(request, env, ctx) {
			return new Response(env.MY_TEXT);
		}
	}
`;

const workerTest = dedent`
	import { env, SELF } from "cloudflare:test";
	import { it } from "vitest";

	it("provides bindings from cloudflare.config.ts", ({ expect }) => {
		expect(env.MY_TEXT).toBe("from the new config");
	});

	it("dispatches to the entrypoint declared in cloudflare.config.ts", async ({
		expect,
	}) => {
		const response = await SELF.fetch("http://example.com");
		expect(await response.text()).toBe("from the new config");
	});
`;

test("loads cloudflare.config.ts from the project root", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			config: true,
		}),
		"cloudflare.config.ts": dedent`
			export default {
				worker: {
					name: "test-worker",
					compatibilityDate: "2025-12-02",
					entrypoint: "./index.ts",
					env: {
						MY_TEXT: { type: "text", value: "from the new config" },
					},
				},
			};
		`,
		"index.ts": worker,
		"index.test.ts": workerTest,
	});

	const result = await vitestRun();

	await expect(result.exitCode).resolves.toBe(0);
});

test("resolves a custom config path and its entrypoint", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			config: "./config/cloudflare.config.ts",
		}),
		// `entrypoint` is resolved relative to the config file, not the project root
		"config/cloudflare.config.ts": dedent`
			export default {
				worker: {
					name: "test-worker",
					compatibilityDate: "2025-12-02",
					entrypoint: "../index.ts",
					env: {
						MY_TEXT: { type: "text", value: "from the new config" },
					},
				},
			};
		`,
		"index.ts": worker,
		"index.test.ts": workerTest,
	});

	const result = await vitestRun();

	await expect(result.exitCode).resolves.toBe(0);
});

test("defaults config functions to test mode", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			config: true,
		}),
		"cloudflare.config.ts": dedent`
			export default (ctx) => ({
				worker: {
					name: "test-worker",
					compatibilityDate: "2025-12-02",
					entrypoint: "./index.ts",
					env: {
						MY_TEXT: { type: "text", value: ctx.mode },
					},
				},
			});
		`,
		"index.ts": worker,
		"index.test.ts": dedent`
			import { env } from "cloudflare:test";
			import { it } from "vitest";

			it("defaults the mode to \\"test\\"", ({ expect }) => {
				expect(env.MY_TEXT).toBe("test");
			});
		`,
	});

	const result = await vitestRun();

	await expect(result.exitCode).resolves.toBe(0);
});

test("overrides config function mode with --mode", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			config: true,
		}),
		"cloudflare.config.ts": dedent`
			export default (ctx) => ({
				worker: {
					name: "test-worker",
					compatibilityDate: "2025-12-02",
					entrypoint: "./index.ts",
					env: {
						MY_TEXT: { type: "text", value: ctx.mode },
					},
				},
			});
		`,
		"index.ts": worker,
		"index.test.ts": dedent`
			import { env } from "cloudflare:test";
			import { it } from "vitest";

			it("uses the mode passed to --mode", ({ expect }) => {
				expect(env.MY_TEXT).toBe("staging");
			});
		`,
	});

	const result = await vitestRun({ flags: ["--mode=staging"] });

	await expect(result.exitCode).resolves.toBe(0);
});

test("binds the config's own Durable Objects, Worker and secrets", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			config: true,
		}),
		"cloudflare.config.ts": dedent`
			export default {
				worker: {
					name: "test-worker",
					compatibilityDate: "2025-12-02",
					entrypoint: "./index.ts",
					env: {
						COUNTER: { type: "durable-object", worker: "test-worker", exportName: "Counter" },
						SELF_SERVICE: { type: "worker", worker: "test-worker" },
						API_KEY: { type: "secret" },
					},
					exports: {
						Counter: { type: "durable-object", storage: "sqlite" },
						Unbound: { type: "durable-object", storage: "sqlite" },
					},
				},
			};
		`,
		".dev.vars": "API_KEY=from-dev-vars",
		"index.ts": dedent`
			import { DurableObject } from "cloudflare:workers";
			export class Counter extends DurableObject {
				count = 0;
				increment() { return ++this.count; }
			}
			export class Unbound extends Counter {}
			export default {
				async fetch(request, env) {
					return new Response(String(await env.COUNTER.getByName("fetch").increment()));
				},
			}
		`,
		"index.test.ts": dedent`
			import { env, listDurableObjectIds, runInDurableObject } from "cloudflare:test";
			import { exports } from "cloudflare:workers";
			import { it } from "vitest";

			it("calls a Durable Object bound to its own Worker", async ({ expect }) => {
				expect(await env.COUNTER.getByName("rpc").increment()).toBe(1);
			});

			it("runs code inside that Durable Object", async ({ expect }) => {
				const stub = env.COUNTER.getByName("inside");
				expect(await runInDurableObject(stub, (instance) => instance.increment())).toBe(1);
				const ids = await listDurableObjectIds(env.COUNTER);
				expect(ids.some((id) => id.equals(stub.id))).toBe(true);
			});

			it("runs code inside a Durable Object that is only exported", async ({ expect }) => {
				const stub = exports.Unbound.getByName("inside");
				expect(await runInDurableObject(stub, (instance) => instance.increment())).toBe(1);
			});

			it("calls its own Worker through a service binding", async ({ expect }) => {
				const response = await env.SELF_SERVICE.fetch("http://example.com");
				expect(await response.text()).toBe("1");
			});

			it("fills declared secrets from .dev.vars", ({ expect }) => {
				expect(env.API_KEY).toBe("from-dev-vars");
			});
		`,
	});

	const result = await vitestRun();

	await expect(result.exitCode).resolves.toBe(0);
	expect(result.stdout).toMatch("5 passed");
});

test("wraps Workflows bound to the config's own Worker and connects tail consumers", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			config: true,
			miniflare: {
				// Before 2025-11-17, unexported Workflows need a wrapper
				compatibilityDate: "2025-06-01",
				workers: [
					{
						name: "tail-worker",
						compatibilityDate: "2025-06-01",
						modules: [
							{
								type: "ESModule",
								path: "index.mjs",
								contents:
									"export default { tail() { console.log('tail received'); } };",
							},
						],
					},
				],
			},
		}),
		"cloudflare.config.ts": dedent`
			export default {
				worker: {
					name: "test-worker",
					compatibilityDate: "2025-12-02",
					entrypoint: "./index.ts",
					env: {
						MY_WORKFLOW: { type: "workflow", name: "my-workflow", worker: "test-worker", exportName: "MyWorkflow" },
					},
					tailConsumers: [{ worker: "test-worker" }, { worker: "tail-worker" }],
				},
			};
		`,
		"index.ts": dedent`
			import { WorkflowEntrypoint } from "cloudflare:workers";
			export class MyWorkflow extends WorkflowEntrypoint {
				async run(event, step) {
					return await step.do("greet", async () => "Hello, " + event.payload.name);
				}
			}
			export default {};
		`,
		"index.test.ts": dedent`
			import { env } from "cloudflare:test";
			import { it } from "vitest";

			it("runs a Workflow bound to its own Worker", async ({ expect }) => {
				const instance = await env.MY_WORKFLOW.create({ params: { name: "World" } });
				await expect
					.poll(() => instance.status())
					.toMatchObject({ status: "complete", output: "Hello, World" });
			});
		`,
	});

	const result = await vitestRun();

	await expect(result.exitCode).resolves.toBe(0);
	expect(result.stdout).toMatch("1 passed");
	const output = `${result.stdout}${result.stderr}`;
	expect(output).toMatch("tail received");
	expect(output).toMatch(
		'Tail consumer "test-worker" was not found in `miniflare.workers`.'
	);
});

test("merges `miniflare` options over the config's Worker", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			config: true,
			miniflare: {
				bindings: { MY_TEXT: "from miniflare" },
				// The config's Hyperdrive has no local connection string
				hyperdrives: { DB: "postgres://user:password@localhost:5432/database" },
				// Binding `Counter` here keeps the config's SQLite storage for it
				durableObjects: { MF_COUNTER: "Counter" },
				// Come before the default rules, which would otherwise shadow them
				modulesRules: [{ type: "Text", include: ["**/*.md"] }],
				// `other-queue` is consumed as well as the config's queues, and
				// `tuned-queue` replaces the config's consumer for that queue
				queueConsumers: {
					"other-queue": {},
					"tuned-queue": { maxBatchSize: 1 },
				},
				assets: { directory: "./public" },
				// Replaces the config's `VERSION`, as a Worker can only have one
				versionMetadata: "MF_VERSION",
				serviceBindings: { AUX: "aux", SELF_BY_NAME: "test-worker" },
				workers: [
					{
						name: "aux",
						modules: true,
						script:
							"export default { fetch() { return new Response('aux'); } }",
					},
				],
			},
		}),
		"cloudflare.config.ts": dedent`
			export default {
				worker: {
					name: "test-worker",
					compatibilityDate: "2025-12-02",
					entrypoint: "./index.ts",
					env: {
						MY_TEXT: { type: "text", value: "from config" },
						QUEUE: { type: "queue", name: "my-queue" },
						TUNED_QUEUE: { type: "queue", name: "tuned-queue" },
						RESULTS: { type: "kv" },
						ASSETS: { type: "assets" },
						VERSION: { type: "version-metadata" },
						DB: { type: "hyperdrive", id: "hyperdrive-id" },
					},
					triggers: [
						{ type: "queue", name: "my-queue", maxBatchSize: 1 },
						{ type: "queue", name: "tuned-queue", maxBatchSize: 100, maxBatchTimeout: 60 },
					],
					assets: { notFoundHandling: "404-page" },
					exports: {
						Counter: { type: "durable-object", storage: "sqlite" },
					},
				},
			};
		`,
		"public/hello.txt": "hello from assets",
		"public/404.html": "not found page",
		"notes.md": "hello from markdown",
		"index.ts": dedent`
			import { DurableObject } from "cloudflare:workers";
			export class Counter extends DurableObject {
				sql() {
					return this.ctx.storage.sql.exec("SELECT 1 AS one").one().one;
				}
			}
			export default {
				async fetch() {
					return new Response("ok");
				},
				async queue(batch, env) {
					for (const message of batch.messages) {
						await env.RESULTS.put(batch.queue, String(message.body));
					}
				},
			};
		`,
		"index.test.ts": dedent`
			import { env } from "cloudflare:test";
			import { it } from "vitest";
			import notes from "./notes.md";

			it("lets a \`miniflare\` binding replace the config's with the same name", ({ expect }) => {
				expect(env.MY_TEXT).toBe("from miniflare");
			});

			it("delivers messages to the config's queue consumer", async ({ expect }) => {
				await env.QUEUE.send("hello");
				await expect
					.poll(() => env.RESULTS.get("my-queue"), { timeout: 10_000 })
					.toBe("hello");
			});

			it("applies \`miniflare\` settings for the same queue", async ({ expect }) => {
				await env.TUNED_QUEUE.send("tuned");
				await expect
					.poll(() => env.RESULTS.get("tuned-queue"), { timeout: 10_000 })
					.toBe("tuned");
			});

			it("serves \`miniflare.assets\` with the config's binding and settings", async ({ expect }) => {
				const response = await env.ASSETS.fetch("http://example.com/hello.txt");
				expect(await response.text()).toBe("hello from assets");
				const missing = await env.ASSETS.fetch("http://example.com/missing");
				expect(missing.status).toBe(404);
				expect(await missing.text()).toBe("not found page");
			});

			it("lets a \`miniflare\` binding replace a single-use config binding", ({ expect }) => {
				expect(env.MF_VERSION).toBeDefined();
				expect(env.VERSION).toBeUndefined();
			});

			it("calls an auxiliary Worker and the config's own Worker", async ({ expect }) => {
				expect(await (await env.AUX.fetch("http://example.com")).text()).toBe("aux");
				expect(await (await env.SELF_BY_NAME.fetch("http://example.com")).text()).toBe("ok");
			});

			it("lets \`miniflare\` supply a binding's local value", ({ expect }) => {
				expect(env.DB.database).toBe("database");
			});

			it("keeps the config's storage for a class \`miniflare\` binds", async ({ expect }) => {
				expect(await env.MF_COUNTER.getByName("a").sql()).toBe(1);
			});

			it("applies \`miniflare\` module rules before the defaults", ({ expect }) => {
				expect(notes).toBe("hello from markdown");
			});
		`,
	});

	const result = await vitestRun();

	await expect(result.exitCode).resolves.toBe(0);
	expect(result.stdout).toMatch("9 passed");
});

describe("validation", () => {
	test("rejects the removed `experimental.newConfig` option", async ({
		expect,
		seed,
		vitestRun,
	}) => {
		await seed({
			"vitest.config.mts": vitestConfig({
				experimental: { newConfig: true },
			}),
			"index.test.ts": "",
		});

		const result = await vitestRun();

		expect(await result.exitCode).toBe(1);
		expect(result.stderr).toMatch(
			"`experimental.newConfig` is now the `config` option."
		);
	});

	test("rejects `wrangler` combined with `config`", async ({
		expect,
		seed,
		vitestRun,
	}) => {
		await seed({
			"vitest.config.mts": vitestConfig({
				wrangler: { configPath: "./wrangler.jsonc" },
				config: true,
			}),
			"index.test.ts": "",
		});

		const result = await vitestRun();

		expect(await result.exitCode).toBe(1);
		expect(result.stderr).toMatch(
			"`wrangler` can't be used with `config`. Set `config` to use `cloudflare.config.ts`, or `wrangler` to use a Wrangler configuration file."
		);
	});

	test("reports a missing cloudflare.config.ts", async ({
		expect,
		seed,
		vitestRun,
		tmpPath,
	}) => {
		await seed({
			"vitest.config.mts": vitestConfig({
				config: true,
			}),
			"index.test.ts": "",
		});

		const result = await vitestRun();

		expect(await result.exitCode).toBe(1);
		expect(result.stderr).toMatch(
			`\`config\` is enabled but no \`cloudflare.config.ts\` was found at ${path.join(tmpPath, "cloudflare.config.ts")}`
		);
	});

	test("reports a config that does not define a Worker", async ({
		expect,
		seed,
		vitestRun,
	}) => {
		await seed({
			"vitest.config.mts": vitestConfig({
				config: true,
			}),
			"cloudflare.config.ts": dedent`
				export default { accountId: "abc123" };
			`,
			"index.test.ts": "",
		});

		const result = await vitestRun();

		expect(await result.exitCode).toBe(1);
		expect(result.stderr).toMatch(
			"`cloudflare.config.ts` must define a Worker using the `worker` property."
		);
	});

	test("reports an invalid config", async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": vitestConfig({
				config: true,
			}),
			// `compatibilityDate` is required
			"cloudflare.config.ts": dedent`
				export default {
					worker: {
						name: "test-worker",
						entrypoint: "./index.ts",
					},
				};
			`,
			"index.ts": worker,
			"index.test.ts": "",
		});

		const result = await vitestRun();

		expect(await result.exitCode).toBe(1);
		expect(result.stderr).toMatch("Invalid `cloudflare.config.ts`");
		expect(result.stderr).toMatch("→ at worker.compatibilityDate");
	});
});

describe("remote bindings", () => {
	runInTempDir();

	let project: TestProject;

	beforeEach(() => {
		// Records whether Wrangler was imported. Registered after
		// `vi.resetModules()`, so it runs again on each test's first import.
		vi.resetModules();
		vi.doMock("wrangler", () => {
			state.wranglerImported = true;
			return {};
		});
		state.wranglerImported = false;
		project = {
			name: "test",
			config: { root: process.cwd() },
			vite: { config: { mode: "test", envDir: process.cwd() } },
		} as unknown as TestProject;
		maybeStartOrUpdateRemoteProxySession.mockReset();
		requireAuth.mockClear();
		maybeStartOrUpdateRemoteProxySession.mockResolvedValue({
			session: { remoteProxyConnectionString },
			remoteBindings: {},
		});
	});

	it("uses cf credentials with `config`, without Wrangler", async ({
		expect,
	}) => {
		// A config function, so the account follows the mode between parses
		await fs.writeFile(
			"cloudflare.config.ts",
			`export default ({ mode }) => ({
				accountId: mode + "-account",
				worker: {
					name: "test-worker",
					compatibilityDate: "2025-12-02",
					env: {
						KV: { type: "kv", id: "kv-id", dev: { remote: true } },
					},
				},
			});`
		);
		const { parseProjectOptions } = await import("../src/pool/config");
		const stagingProject = {
			name: project.name,
			config: project.config,
			vite: { config: { mode: "staging", envDir: process.cwd() } },
		} as unknown as TestProject;

		const options = await parseProjectOptions(project, { config: true });
		await parseProjectOptions(project, { config: true });
		await parseProjectOptions(stagingProject, { config: true });

		const [[details, , auth, context], [, , sameAuth], [, , stagingAuth]] =
			maybeStartOrUpdateRemoteProxySession.mock.calls;
		expect(details).toMatchObject({
			name: "test-worker",
			target: "cf",
			env: { KV: { type: "kv", id: "kv-id", dev: { remote: true } } },
		});
		expect(context).toMatchObject({ cliDisplayName: "cf" });
		expect(options.projectWorkers?.[0].dev?.remoteProxyConnectionString).toBe(
			remoteProxyConnectionString
		);
		// The key identifies the credentials, so the session only restarts when
		// the account changes
		expect(sameAuth.key).toBe(auth.key);
		expect(stagingAuth.key).not.toBe(auth.key);
		await expect(auth.hook()).resolves.toEqual({
			accountId: "cf-account-id",
			apiToken: { apiToken: "cf-token" },
		});
		await stagingAuth.hook();
		expect(requireAuth.mock.calls).toEqual([
			[{ account_id: "test-account" }],
			[{ account_id: "staging-account" }],
		]);
		expect(resolveProfile).toHaveBeenCalledWith({ cwd: process.cwd() });
		expect(state.wranglerImported).toBe(false);
	});

	it("rejects `miniflare` remote bindings on another proxy session", async ({
		expect,
	}) => {
		await fs.writeFile(
			"cloudflare.config.ts",
			`export default {
				worker: {
					name: "test-worker",
					compatibilityDate: "2025-12-02",
					env: { KV: { type: "kv", id: "kv-id", dev: { remote: true } } },
				},
			};`
		);
		const { parseProjectOptions } = await import("../src/pool/config");

		await expect(
			parseProjectOptions(project, {
				config: true,
				miniflare: {
					kvNamespaces: {
						OTHER_KV: {
							id: "other-kv-id",
							remoteProxyConnectionString: new URL(
								"http://localhost:8788"
							) as RemoteProxyConnectionString,
						},
					},
				},
			})
		).rejects.toThrow(
			"Remote bindings in `miniflare` options and in `cloudflare.config.ts` use different remote proxy sessions"
		);
	});
});
