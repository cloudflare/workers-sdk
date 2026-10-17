import dedent from "ts-dedent";
import { test } from "./helpers";

test(
	"adminWorkflowConcurrencyKeys makes a keyed step wait for a free slot",
	{ timeout: 60_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": dedent /* javascript */ `
				import { cloudflareTest } from "@cloudflare/vitest-plugin";

				export default {
					plugins: [
						cloudflareTest({
							main: "./index.ts",
							wrangler: { configPath: "./wrangler.jsonc" },
						}),
					],
					test: { testTimeout: 30_000 },
				};
			`,
			"wrangler.jsonc": dedent`
				{
					"name": "workflow-concurrency",
					"main": "./index.ts",
					"compatibility_date": "2026-08-28",
					"workflows": [
						{
							"binding": "MY_WORKFLOW",
							"name": "my-workflow",
							"class_name": "MyWorkflow"
						}
					]
				}
			`,
			"index.ts": dedent /* javascript */ `
				import { WorkflowEntrypoint } from "cloudflare:workers";
				export class MyWorkflow extends WorkflowEntrypoint {
					async run(event, step) {
						return await step.do(
							"charge",
							{ concurrency: "payments-api" },
							async () => "charged"
						);
					}
				}
				export default {
					async fetch() { return new Response("ok"); },
				};
			`,
			"index.test.ts": dedent /* javascript */ `
				import { adminWorkflowConcurrencyKeys } from "cloudflare:test";
				import { env } from "cloudflare:workers";
				import { it, expect } from "vitest";

				it("waits while the key is full", async () => {
					using keys = adminWorkflowConcurrencyKeys(env.MY_WORKFLOW);
					await keys.set("payments-api", 1);
					const hold = await keys.hold("payments-api");

					const instance = await env.MY_WORKFLOW.create({ id: "waiting" });
					await keys.waitForWaiters("payments-api");
					expect(await keys.get("payments-api")).toMatchObject({
						limit: 1,
						usage: { holding: 1, waiting: 1 },
					});
					expect((await instance.status()).status).toBe("running");

					await hold.release();
					await expect
						.poll(async () => (await instance.status()).output)
						.toBe("charged");
				});

				it("releases its holds when disposed", async () => {
					{
						using keys = adminWorkflowConcurrencyKeys(env.MY_WORKFLOW);
						await keys.set("payments-api", 1);
						await keys.hold("payments-api");
					}
					using keys = adminWorkflowConcurrencyKeys(env.MY_WORKFLOW);
					await expect
						.poll(async () => (await keys.get("payments-api"))?.usage.holding)
						.toBe(0);
				});
			`,
		});

		const result = await vitestRun();
		expect(await result.exitCode).toBe(0);
	}
);
