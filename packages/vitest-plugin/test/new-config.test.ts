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

test("applies the config's queue consumers", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({ config: true }),
		"cloudflare.config.ts": dedent`
			export default {
				worker: {
					name: "test-worker",
					compatibilityDate: "2025-12-02",
					entrypoint: "./index.ts",
					env: {
						QUEUE: { type: "queue", name: "my-queue" },
						RESULTS: { type: "kv" },
					},
					triggers: [{ type: "queue", name: "my-queue", maxBatchSize: 1 }],
				},
			};
		`,
		"index.ts": dedent`
			export default {
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
		`,
	});

	const result = await vitestRun();

	await expect(result.exitCode).resolves.toBe(0);
	expect(result.stdout).toMatch("1 passed");
});

test("wraps Workflows bound to the config's own Worker and ignores tail consumers", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({ config: true }),
		"cloudflare.config.ts": dedent`
			export default {
				worker: {
					name: "test-worker",
					// Before 2025-11-17, unexported Workflows need a wrapper
					compatibilityDate: "2025-06-01",
					entrypoint: "./index.ts",
					env: {
						MY_WORKFLOW: { type: "workflow", name: "my-workflow", worker: "test-worker", exportName: "MyWorkflow" },
					},
					tailConsumers: [{ worker: "test-worker" }],
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
			export default {
				tail(events) {
					console.log("tail", events.length);
				},
			};
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
	expect(`${result.stdout}${result.stderr}`).toMatch(
		'Tail consumers aren\'t supported with `config` yet, so "test-worker" was ignored.'
	);
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

	test("rejects `miniflare` combined with `config`", async ({
		expect,
		seed,
		vitestRun,
	}) => {
		await seed({
			"vitest.config.mts": vitestConfig({
				config: true,
				miniflare: { kvNamespaces: ["KV"] },
			}),
			"index.test.ts": "",
		});

		const result = await vitestRun();

		expect(await result.exitCode).toBe(1);
		expect(result.stderr).toMatch(
			"`miniflare` and `config` cannot be used together. Configure the Worker in `cloudflare.config.ts` instead."
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
