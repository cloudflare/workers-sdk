import dedent from "ts-dedent";
import { test } from "./helpers";

test(
	"accepts wrangler config with `exports`",
	{ timeout: 60_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": dedent /* javascript */ `
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
					"name": "do-exports",
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
	}
);
