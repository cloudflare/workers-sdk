import dedent from "ts-dedent";
import { test } from "./helpers";

// https://github.com/cloudflare/workers-sdk/issues/16887
//
// Driving a Workflow to `errored` or `terminated`, or catching the rejection
// of `get()` for a missing instance, is normal Workflows usage. None of it
// should be reported as an uncaught exception, as the `Instance dispose`
// teardown message already isn't.
const files = {
	"vitest.config.mts": dedent /* javascript */ `
		import { cloudflareTest } from "@cloudflare/vitest-plugin";

		export default {
			plugins: [
				cloudflareTest({
					wrangler: { configPath: "./wrangler.jsonc" },
				}),
			],
			test: { testTimeout: 90_000 },
		};
	`,
	"wrangler.jsonc": JSON.stringify({
		name: "workflow-uncaught-noise",
		main: "./index.ts",
		compatibility_date: "2026-09-03",
		workflows: [
			{
				name: "my-workflow",
				binding: "MY_WORKFLOW",
				class_name: "MyWorkflow",
			},
		],
	}),
	"index.ts": dedent /* javascript */ `
		import { WorkflowEntrypoint } from "cloudflare:workers";
		import { NonRetryableError } from "cloudflare:workflows";

		export class MyWorkflow extends WorkflowEntrypoint {
			async run(event, step) {
				await step.do("first", async () => {
					if (event.payload.mode === "fail") {
						throw new NonRetryableError("__EXPECTED_STEP_FAILURE__");
					}
					return "ok";
				});
				await step.sleep("wait", "1 hour");
			}
		}

		export default {
			fetch() {
				return new Response("ok");
			},
		};
	`,
};

const erroredTest = dedent /* javascript */ `
	import { introspectWorkflowInstance } from "cloudflare:test";
	import { env } from "cloudflare:workers";
	import { it } from "vitest";

	it("step throws NonRetryableError -> errored", async ({ expect }) => {
		await using instance = await introspectWorkflowInstance(env.MY_WORKFLOW, "fail-1");
		await env.MY_WORKFLOW.create({ id: "fail-1", params: { mode: "fail" } });
		await instance.waitForStatus("errored");
		const handle = await env.MY_WORKFLOW.get("fail-1");
		expect((await handle.status()).status).toBe("errored");
	});
`;

test(
	"Workers Vitest does not report the engine aborting an errored Workflow as uncaught",
	{ timeout: 60_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({ ...files, "index.test.ts": erroredTest });

		const result = await vitestRun();
		await expect(result.exitCode, result.stderr).resolves.toBe(0);
		// workerd logs `broken.outputGateBroken; jsg.Error: Aborting engine: A
		// step threw a NonRetryableError` as an uncaught exception.
		expect(result.stdout + result.stderr).not.toContain(
			"jsg.Error: Aborting engine"
		);
	}
);

test(
	"Workers Vitest does not report a step's NonRetryableError, which the engine records as errored, as uncaught",
	{ timeout: 60_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({ ...files, "index.test.ts": erroredTest });

		const result = await vitestRun();
		await expect(result.exitCode, result.stderr).resolves.toBe(0);
		expect(result.stdout + result.stderr).not.toMatch(
			/uncaught exception;[^\n]*__EXPECTED_STEP_FAILURE__/
		);
	}
);

test(
	"Workers Vitest does not report a terminated Workflow as uncaught",
	{ timeout: 60_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			...files,
			"index.test.ts": dedent /* javascript */ `
				import { introspectWorkflowInstance } from "cloudflare:test";
				import { env } from "cloudflare:workers";
				import { it } from "vitest";

				it("terminate -> terminated", async ({ expect }) => {
					await using instance = await introspectWorkflowInstance(env.MY_WORKFLOW, "sleep-1");
					const created = await env.MY_WORKFLOW.create({ id: "sleep-1", params: { mode: "sleep" } });
					await instance.waitForStatus("running");
					await created.terminate();
					await instance.waitForStatus("terminated");
					expect((await created.status()).status).toBe("terminated");
				});
			`,
		});

		const result = await vitestRun();
		await expect(result.exitCode, result.stderr).resolves.toBe(0);
		expect(result.stdout + result.stderr).not.toContain("uncaught exception");
	}
);

test(
	"Workers Vitest does not report a caught Workflow instance.not_found as uncaught",
	{ timeout: 60_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			...files,
			"index.test.ts": dedent /* javascript */ `
				import { env } from "cloudflare:workers";
				import { it } from "vitest";

				it("get() of a missing instance rejects and is caught", async ({ expect }) => {
					const error = await env.MY_WORKFLOW.get("does-not-exist").catch((e) => e);
					expect(error).toBeInstanceOf(Error);
				});
			`,
		});

		const result = await vitestRun();
		await expect(result.exitCode, result.stderr).resolves.toBe(0);
		expect(result.stdout + result.stderr).not.toContain("uncaught exception");
	}
);
