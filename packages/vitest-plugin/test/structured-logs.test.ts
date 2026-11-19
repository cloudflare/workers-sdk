import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

const caughtRpcError = "__CAUGHT_DURABLE_OBJECT_RPC_ERROR__";
const durableObjectFiles = {
	"index.ts": dedent`
		import { DurableObject } from "cloudflare:workers";

		export class ThrowingDurableObject extends DurableObject {
			throwRpcError() {
				throw new Error("${caughtRpcError}");
			}
		}
	`,
	"index.test.ts": dedent`
		import { env } from "cloudflare:test";
		import { it } from "vitest";

		it("catches a Durable Object RPC error", async ({ expect }) => {
			const stub = env.THROWER.getByName("thrower");
			let caught;
			try {
				await stub.throwRpcError();
			} catch (error) {
				caught = error;
			}
			expect(caught).toBeInstanceOf(Error);
		});
	`,
};

function durableObjectConfig(verbose?: boolean): string {
	return vitestConfig({
		main: "./index.ts",
		verbose,
		miniflare: {
			compatibilityDate: "2025-12-02",
			compatibilityFlags: ["nodejs_compat"],
			durableObjects: { THROWER: "ThrowingDurableObject" },
		},
	});
}

test("routes workerd structured logs to the correct output stream", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig(),
		"index.test.ts": dedent`
			import { it, expect } from "vitest";
			it("emits structured logs at various levels", () => {
				// __console is the original workerd console, saved before Vitest
				// patches globalThis.console. Output from __console goes through
				// workerd stdout -> structured log parsing -> handleStructuredLogs,
				// which routes error/warn to process.stderr and everything else
				// to process.stdout.
				__console.log("__STDOUT_LOG__");
				__console.warn("__STDERR_WARN__");
				__console.error("__STDERR_ERROR__");
				expect(true).toBe(true);
			});
		`,
	});
	const result = await vitestRun();
	expect(await result.exitCode).toBe(0);

	// handleStructuredLogs routes log-level output to stdout
	expect(result.stdout).toContain("__STDOUT_LOG__");

	// handleStructuredLogs routes warn/error-level output to stderr
	expect(result.stderr).toContain("__STDERR_WARN__");
	expect(result.stderr).toContain("__STDERR_ERROR__");
});

test(
	"ignores Workflow engine aborts for NonRetryableError and terminate only",
	{ timeout: 60_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": vitestConfig({
				main: "./index.ts",
				wrangler: { configPath: "./wrangler.jsonc" },
			}),
			"wrangler.jsonc": dedent`
				{
					"name": "workflow-aborts",
					"main": "./index.ts",
					"compatibility_date": "2025-12-02",
					"workflows": [
						{
							"binding": "MY_WORKFLOW",
							"name": "my-workflow",
							"class_name": "MyWorkflow"
						}
					]
				}
			`,
			"index.ts": dedent`
				import { WorkflowEntrypoint } from "cloudflare:workers";
				import { NonRetryableError } from "cloudflare:workflows";

				export class MyWorkflow extends WorkflowEntrypoint {
					async run(event, step) {
						await step.do("first", async () => {
							if (event.payload.mode === "fail") {
								throw new NonRetryableError("boom");
							}
							if (event.payload.mode === "unserialisable") {
								return () => {};
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
			"index.test.ts": dedent`
				import { env } from "cloudflare:workers";
				import { it } from "vitest";

				async function status(id) {
					const instance = await env.MY_WORKFLOW.get(id);
					return (await instance.status()).status;
				}

				it("ends instances as errored and terminated", async ({ expect }) => {
					// First, so its abort is logged before the run ends
					await env.MY_WORKFLOW.create({
						id: "unserialisable",
						params: { mode: "unserialisable" },
					});
					await expect.poll(() => status("unserialisable")).toBe("errored");

					await env.MY_WORKFLOW.create({ id: "fail", params: { mode: "fail" } });
					await expect.poll(() => status("fail")).toBe("errored");

					const sleeping = await env.MY_WORKFLOW.create({
						id: "sleep",
						params: { mode: "sleep" },
					});
					await expect.poll(() => status("sleep")).toBe("running");
					await sleeping.terminate();
					await expect.poll(() => status("sleep")).toBe("terminated");
				});
			`,
		});

		const result = await vitestRun();
		expect(await result.exitCode).toBe(0);

		// workerd reports these on stderr on macOS and on stdout on Linux
		const output = result.stdout + result.stderr;
		expect(output).not.toContain(
			"Aborting engine: A step threw a NonRetryableError"
		);
		expect(output).not.toContain("Aborting engine: User called terminate");
		// Nothing else reports this failure, so its abort must stay visible
		expect(output).toContain("Aborting engine: Value is not serialisable");
	}
);

test("enables verbose workerd logging by default", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": durableObjectConfig(),
		...durableObjectFiles,
	});

	const result = await vitestRun();
	expect(await result.exitCode).toBe(0);
	expect(result.stdout).toContain(caughtRpcError);
});

test("passes verbose false to Miniflare", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": durableObjectConfig(false),
		...durableObjectFiles,
	});

	const result = await vitestRun();
	expect(await result.exitCode).toBe(0);
	expect(result.stdout).not.toContain(caughtRpcError);
	expect(result.stderr).not.toContain(caughtRpcError);
});
