import dedent from "ts-dedent";
import { test } from "./helpers";

test(
	"runs a Workflow declared in `exports` through `ctx.exports` and its own binding",
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
					test: { testTimeout: 90_000 },
				};
			`,
			// The binding's `script_name` is the Worker's own name, which the
			// renamed Vitest runner Worker must still resolve to itself.
			"wrangler.jsonc": dedent`
				{
					"name": "workflow-exports",
					"main": "./index.ts",
					"compatibility_date": "2026-08-28",
					"workflows": [
						{
							"binding": "MY_WORKFLOW",
							"name": "my-workflow",
							"class_name": "MyWorkflow",
							"script_name": "workflow-exports"
						}
					],
					"exports": {
						"MyWorkflow": { "type": "workflow", "name": "my-workflow" }
					}
				}
			`,
			"index.ts": dedent /* javascript */ `
				import { WorkflowEntrypoint } from "cloudflare:workers";
				export class MyWorkflow extends WorkflowEntrypoint {
					async run(event, step) {
						return await step.do("greet", async () => "Hello, " + event.payload.name);
					}
				}
				export default {
					async fetch() { return new Response("ok"); },
				};
			`,
			"index.test.ts": dedent /* javascript */ `
				import { env, exports } from "cloudflare:workers";
				import { it, expect } from "vitest";
				it("shares instances between ctx.exports and the binding", async () => {
					await exports.MyWorkflow.create({ id: "from-exports", params: { name: "exports" } });
					await env.MY_WORKFLOW.create({ id: "from-env", params: { name: "env" } });
					await expect
						.poll(async () => (await env.MY_WORKFLOW.get("from-exports")).status())
						.toMatchObject({ status: "complete", output: "Hello, exports" });
					await expect
						.poll(async () => (await exports.MyWorkflow.get("from-env")).status())
						.toMatchObject({ status: "complete", output: "Hello, env" });
				});
			`,
		});

		const result = await vitestRun();
		expect(await result.exitCode).toBe(0);
	}
);
