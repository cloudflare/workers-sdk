import dedent from "ts-dedent";
import { minimalVitestConfig, test, waitFor } from "./helpers";

test("automatically re-runs unit tests", async ({
	expect,
	seed,
	vitestDev,
}) => {
	await seed({
		"vitest.config.ts": minimalVitestConfig,
		"index.ts": dedent`
			export default {
				async fetch(request, env, ctx) {
					return new Response("wrong");
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
				expect(await response.text()).toBe("correct");
			});
		`,
	});
	const result = vitestDev();
	await waitFor(() => {
		expect(result.stdout).toMatch("expected 'wrong' to be 'correct'");
		expect(result.stdout).toMatch("Tests  1 failed");
	});

	await seed({
		"index.ts": dedent`
			export default {
				async fetch(request, env, ctx) {
					return new Response("correct");
				}
			}
		`,
	});
	await waitFor(() => {
		expect(result.stdout).toMatch("Tests  1 passed");
	});
});

test("automatically re-runs integration tests", async ({
	expect,
	seed,
	vitestDev,
}) => {
	// TODO(soon): remove requirement for `import "./index";`
	await seed({
		"vitest.config.ts": dedent`
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
					return new Response("wrong");
				}
			}
		`,
		"index.test.ts": dedent`
			import { SELF } from "cloudflare:test";
			import { it, expect } from "vitest";
			import "./index";
			it("sends request", async () => {
				const response = await SELF.fetch("https://example.com");
				expect(await response.text()).toBe("correct");
			});
		`,
	});
	const result = vitestDev();
	await waitFor(() => {
		expect(result.stdout).toMatch("expected 'wrong' to be 'correct'");
		expect(result.stdout).toMatch("Tests  1 failed");
	});

	await seed({
		"index.ts": dedent`
			export default {
				async fetch(request, env, ctx) {
					return new Response("correct");
				}
			}
		`,
	});
	await waitFor(() => {
		expect(result.stdout).toMatch("Tests  1 passed");
	});
});
