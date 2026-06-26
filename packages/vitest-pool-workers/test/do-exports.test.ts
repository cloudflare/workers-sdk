import dedent from "ts-dedent";
import { test } from "./helpers";

test(
	"errors when wrangler config declares `exports` but `X_DO_EXPORTS` is not set",
	{ timeout: 45_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": dedent /* javascript */ `
				import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

				export default {
					plugins: [
						cloudflareTest({
							wrangler: { configPath: "./wrangler.jsonc" },
						}),
					],
					test: { testTimeout: 90_000 },
				};
			`,
			"wrangler.jsonc": dedent`
				{
					"name": "do-exports-gate-off",
					"compatibility_date": "2025-12-02",
					"compatibility_flags": ["nodejs_compat"],
					"exports": {
						"MyDurableObject": { "type": "durable-object", "storage": "sqlite" }
					}
				}
			`,
			"index.test.ts": dedent /* javascript */ `
				import { it, expect } from "vitest";
				it("should never run because the pool fails to start", () => {
					expect(true).toBe(true);
				});
			`,
		});

		const result = await vitestRun();
		expect(await result.exitCode).toBe(1);
		expect(result.stderr).toMatch(
			/`X_DO_EXPORTS` environment variable is not set/
		);
	}
);

test(
	"accepts wrangler config with `exports` when `X_DO_EXPORTS` is set in vitest.config",
	{ timeout: 60_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			// Set `X_DO_EXPORTS` at module-load time (before the cloudflareTest
			// plugin runs and before the pool worker process forks) so it is
			// inherited by the pool process which calls into wrangler.
			"vitest.config.mts": dedent /* javascript */ `
				process.env.X_DO_EXPORTS = "true";

				import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

				export default {
					plugins: [
						cloudflareTest({
							main: "./index.ts",
							wrangler: { configPath: "./wrangler.jsonc" },
						}),
					],
					test: { testTimeout: 90_000 },
				};
			`,
			"wrangler.jsonc": dedent`
				{
					"name": "do-exports-gate-on",
					"main": "./index.ts",
					"compatibility_date": "2025-12-02",
					"compatibility_flags": ["nodejs_compat"],
					"durable_objects": {
						"bindings": [
							{ "name": "DO", "class_name": "MyDurableObject" }
						]
					},
					"exports": {
						"MyDurableObject": { "type": "durable-object", "storage": "sqlite" }
					}
				}
			`,
			"index.ts": dedent /* javascript */ `
				import { DurableObject } from "cloudflare:workers";
				export class MyDurableObject extends DurableObject {
					ping() { return "pong"; }
				}
				export default {
					async fetch() { return new Response("ok"); },
				};
			`,
			"index.test.ts": dedent /* javascript */ `
				import { env, runInDurableObject } from "cloudflare:test";
				import { it, expect } from "vitest";
				it("starts the pool and exercises an exports-declared DO", async () => {
					const id = env.DO.idFromName("test");
					const stub = env.DO.get(id);
					const result = await runInDurableObject(stub, (instance) => instance.ping());
					expect(result).toBe("pong");
				});
			`,
		});

		const result = await vitestRun();
		expect(await result.exitCode).toBe(0);
		expect(result.stderr).not.toMatch(
			/`X_DO_EXPORTS` environment variable is not set/
		);
	}
);
