import dedent from "ts-dedent";
import { test, waitFor } from "./helpers";

test("opens an inspector with the `--inspect` argument", async ({
	expect,
	seed,
	vitestDev,
}) => {
	await seed({
		"vitest.config.mts": dedent`
			import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
			export default defineWorkersConfig({
				test: {
					poolOptions: {
						workers: {
							main: "./index.ts",
							singleWorker: true,
							miniflare: {
								compatibilityDate: "2024-01-01",
								compatibilityFlags: ["nodejs_compat"],
							},
						},
					},
				}
			});
		`,
		"index.ts": dedent`
			export default {
				async fetch(request, env, ctx) {
					return new Response("hello world");
				}
			}
		`,
		"index.test.ts": dedent`
			import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
			import { it, expect } from "vitest";
			import worker from "./index";
			it("sends request", async () => {
				const request = new Request("https://example.com");
				const ctx = createExecutionContext();
				const response = await worker.fetch(request, env, ctx);
				await waitOnExecutionContext(ctx);
				expect(await response.text()).toBe("hello world");
			});
		`,
	});
	const result = vitestDev({
		flags: ["--inspect", "--no-file-parallelism"],
	});

	await waitFor(() => {
		expect(result.stdout).toMatch("inspector on port 9229");
	});
});

test("customize inspector config", async ({ expect, seed, vitestDev }) => {
	await seed({
		"vitest.config.mts": dedent`
			import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
			export default defineWorkersConfig({
				test: {
					inspector: {
						// Test if this overrides the inspector port
						port: 3456,
					},
					poolOptions: {
						workers: {
							main: "./index.ts",
							// Test if we warn and override the singleWorker option when the inspector is open
							singleWorker: false,
							miniflare: {
								compatibilityDate: "2024-01-01",
								compatibilityFlags: ["nodejs_compat"],
							},
						},
					},
				}
			});
		`,
		"index.ts": dedent`
			export default {
				async fetch(request, env, ctx) {
					return new Response("hello world");
				}
			}
		`,
		"index.test.ts": dedent`
			import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
			import { it, expect } from "vitest";
			import worker from "./index";
			it("sends request", async () => {
				const request = new Request("https://example.com");
				const ctx = createExecutionContext();
				const response = await worker.fetch(request, env, ctx);
				await waitOnExecutionContext(ctx);
				expect(await response.text()).toBe("hello world");
			});
		`,
	});
	const result = vitestDev({
		// Test if we warn and ignore the `waitForDebugger` option
		flags: ["--inspect-brk", "--no-file-parallelism"],
	});

	await waitFor(() => {
		expect(result.stdout).toMatch(
			"Tests run in a single worker when the inspector is open."
		);
		expect(result.stdout).toMatch(`The "--inspect-brk" flag is not supported.`);
		expect(result.stdout).toMatch("Starting single runtime");
		expect(result.stdout).toMatch("inspector on port 3456");
	});
});
