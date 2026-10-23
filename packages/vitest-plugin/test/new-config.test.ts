import path from "node:path";
import dedent from "ts-dedent";
import { describe } from "vitest";
import { test, vitestConfig } from "./helpers";

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

const rootConfig = dedent`
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
		"cloudflare.config.ts": rootConfig,
		"index.ts": worker,
		"index.test.ts": workerTest,
	});

	const result = await vitestRun();

	await expect(result.exitCode).resolves.toBe(0);
});

test("rejects the removed `experimental.newConfig` option", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			experimental: { newConfig: true },
		}),
		"cloudflare.config.ts": rootConfig,
		"index.test.ts": "",
	});

	const result = await vitestRun();

	expect(await result.exitCode).toBe(1);
	expect(result.stderr).toMatch(
		"`experimental.newConfig` has been removed. Use `config` instead."
	);
});

test("binds the config's own Durable Objects, Workflows, Worker and secrets", async ({
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
						MY_WORKFLOW: { type: "workflow", name: "my-workflow", worker: "test-worker", exportName: "MyWorkflow" },
						SELF_SERVICE: { type: "worker", worker: "test-worker" },
						API_KEY: { type: "secret" },
					},
					exports: {
						Counter: { type: "durable-object", storage: "sqlite" },
						Unbound: { type: "durable-object", storage: "sqlite" },
						MyWorkflow: { type: "workflow", name: "my-workflow" },
					},
				},
			};
		`,
		".dev.vars": "API_KEY=from-dev-vars",
		"index.ts": dedent`
			import { DurableObject, WorkflowEntrypoint } from "cloudflare:workers";
			export class Counter extends DurableObject {
				count = 0;
				increment() { return ++this.count; }
			}
			export class Unbound extends Counter {}
			export class MyWorkflow extends WorkflowEntrypoint {
				async run(event, step) {
					return await step.do("greet", async () => "Hello, " + event.payload.name);
				}
			}
			export default {
				async fetch(request, env) {
					return new Response(String(await env.COUNTER.getByName("fetch").increment()));
				}
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

			it("runs a Workflow bound to its own Worker", async ({ expect }) => {
				const instance = await env.MY_WORKFLOW.create({ params: { name: "World" } });
				await expect
					.poll(() => instance.status())
					.toMatchObject({ status: "complete", output: "Hello, World" });
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
	expect(result.stdout).toMatch("6 passed");
});

test("merges `miniflare` queue consumers and assets with the config's", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			config: true,
			miniflare: {
				compatibilityDate: "2025-12-02",
				compatibilityFlags: ["nodejs_compat"],
				// `other-queue` doesn't replace the config's consumers, and
				// `tuned-queue` overrides the config's settings for that queue
				queueConsumers: {
					"other-queue": {},
					"tuned-queue": { maxBatchSize: 1 },
				},
				assets: { directory: "./public" },
			},
		}),
		"cloudflare.config.ts": dedent`
			export default {
				worker: {
					name: "test-worker",
					compatibilityDate: "2025-12-02",
					entrypoint: "./index.ts",
					env: {
						QUEUE: { type: "queue", name: "my-queue" },
						TUNED_QUEUE: { type: "queue", name: "tuned-queue" },
						RESULTS: { type: "kv" },
						ASSETS: { type: "assets" },
					},
					triggers: [
						{ type: "queue", name: "my-queue", maxBatchSize: 1 },
						{ type: "queue", name: "tuned-queue", maxBatchSize: 100, maxBatchTimeout: 60 },
					],
					assets: { notFoundHandling: "404-page" },
				},
			};
		`,
		"public/hello.txt": "hello from assets",
		"public/404.html": "not found page",
		"index.ts": dedent`
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

			it("serves \`miniflare.assets\` through the config's binding", async ({ expect }) => {
				const response = await env.ASSETS.fetch("http://example.com/hello.txt");
				expect(await response.text()).toBe("hello from assets");
			});

			it("applies the config's assets settings", async ({ expect }) => {
				const response = await env.ASSETS.fetch("http://example.com/missing");
				expect(response.status).toBe(404);
				expect(await response.text()).toBe("not found page");
			});
		`,
	});

	const result = await vitestRun();

	await expect(result.exitCode).resolves.toBe(0);
	expect(result.stdout).toMatch("4 passed");
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

describe("validation", () => {
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
			"`wrangler` and `config` cannot be used together. Use `wrangler` to load a Wrangler configuration file, or `config` to load `cloudflare.config.ts`."
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

	test("suggests `wrangler` for a Wrangler config passed to `config`", async ({
		expect,
		seed,
		vitestRun,
	}) => {
		await seed({
			"vitest.config.mts": vitestConfig({
				config: "./wrangler.jsonc",
			}),
			"wrangler.jsonc": "{}",
			"index.test.ts": "",
		});

		const result = await vitestRun();

		expect(await result.exitCode).toBe(1);
		expect(result.stderr).toMatch(
			"`wrangler.jsonc` looks like a Wrangler configuration file. Load it with `wrangler: { configPath }` instead of `config`."
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
