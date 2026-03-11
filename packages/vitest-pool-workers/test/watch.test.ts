import dedent from "ts-dedent";
import { test, vitestConfig, waitFor } from "./helpers";

// NOTE: The DO storage isolation tests (isolatedStorage/singleWorker) were removed
// because these features were dropped in the vitest 4 pool rewrite.

test("automatically re-runs unit tests", async ({
	expect,
	seed,
	vitestDev,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig(),
		"index.ts": dedent/* javascript */ `
			export default {
				async fetch(request, env, ctx) {
					return new Response("wrong");
				}
			}
		`,
		"index.test.ts": dedent/* javascript */ `
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
		expect(result.stderr).toMatch("expected 'wrong' to be 'correct'");
		expect(result.stderr).toMatch("Failed Tests 1");
	});

	await seed({
		"index.ts": dedent/* javascript */ `
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
	await seed({
		"vitest.config.mts": vitestConfig({
			main: "./index.ts",
			miniflare: {
				compatibilityDate: "2025-12-02",
				compatibilityFlags: ["nodejs_compat"],
			},
		}),
		"index.ts": dedent/* javascript */ `
			export default {
				async fetch(request, env, ctx) {
					return new Response("wrong");
				}
			}
		`,
		"index.test.ts": dedent/* javascript */ `
			import { SELF } from "cloudflare:test";
			import { it, expect } from "vitest";
			it("sends request", async () => {
				const response = await SELF.fetch("https://example.com");
				expect(await response.text()).toBe("correct");
			});
		`,
	});
	const result = vitestDev();
	await waitFor(() => {
		expect(result.stderr).toMatch("expected 'wrong' to be 'correct'");
		expect(result.stderr).toMatch("Failed Tests 1");
	});

	await seed({
		"index.ts": dedent/* javascript */ `
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

test("automatically reset module graph", async ({
	expect,
	seed,
	vitestDev,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			main: "./index.ts",
			miniflare: {
				compatibilityDate: "2025-12-02",
				compatibilityFlags: ["nodejs_compat"],
			},
		}),
		"answer.ts": dedent/* javascript */ `
			export function getAnswer() {
				return "wrong";
			}
		`,
		"index.ts": dedent/* javascript */ `
			import { getAnswer } from "./answer";

			export default {
				async fetch(request, env, ctx) {
					const answer = getAnswer();
					return new Response(answer);
				}
			}
		`,
		"index.test.ts": dedent/* javascript */ `
			import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
			import { it, expect, vi } from "vitest";
			import worker from "./index";
			import { getAnswer } from './answer';

			vi.mock('./answer');

			it("mocks module properly", async () => {
				vi.mocked(getAnswer).mockReturnValue("correct");

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
		expect(result.stdout).toMatch("Tests  1 passed");
	});

	// Trigger a re-run by updating the test file with an extra test.
	await seed({
		"index.test.ts": dedent/* javascript */ `
			import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
			import { it, expect, vi } from "vitest";
			import worker from "./index";
			import { getAnswer } from './answer';

			vi.mock('./answer');

			it("mocks module properly", async () => {
				vi.mocked(getAnswer).mockReturnValue("correct");

				const request = new Request("https://example.com");
				const ctx = createExecutionContext();
				const response = await worker.fetch(request, env, ctx);
				await waitOnExecutionContext(ctx);
				expect(await response.text()).toBe("correct");
			});

			it("mocks module properly when re-run in watch mode", async () => {
				vi.mocked(getAnswer).mockReturnValue("test");

				const request = new Request("https://example.com");
				const ctx = createExecutionContext();
				const response = await worker.fetch(request, env, ctx);
				await waitOnExecutionContext(ctx);
				expect(await response.text()).toBe("test");
			});
		`,
	});

	await waitFor(() => {
		expect(result.stdout).toMatch("Tests  2 passed");
	});
});
