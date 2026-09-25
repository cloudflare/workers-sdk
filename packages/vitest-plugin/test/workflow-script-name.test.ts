import dedent from "ts-dedent";
import { test } from "./helpers";

test(
	"runs a Workflow bound with its own Worker's name as `script_name`",
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
			"wrangler.jsonc": dedent`
				{
					"name": "workflow-script-name",
					"main": "./index.ts",
					"compatibility_date": "2026-08-28",
					"workflows": [
						{
							"binding": "MY_WORKFLOW",
							"name": "my-workflow",
							"class_name": "MyWorkflow",
							"script_name": "workflow-script-name"
						}
					]
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
				import { env } from "cloudflare:workers";
				import { it, expect } from "vitest";
				it("runs the Workflow", async () => {
					const instance = await env.MY_WORKFLOW.create({ params: { name: "World" } });
					await expect
						.poll(() => instance.status())
						.toMatchObject({ status: "complete", output: "Hello, World" });
				});
			`,
		});

		const result = await vitestRun();
		expect(await result.exitCode).toBe(0);
	}
);
