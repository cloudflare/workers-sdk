import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { removeDir } from "@cloudflare/workers-utils";
import dedent from "ts-dedent";
import { afterAll, describe, onTestFailed } from "vitest";
import { test, vitestConfig, waitFor } from "./helpers";
import type { Process } from "./helpers";

// NOTE: The DO storage isolation tests (isolatedStorage/singleWorker) were removed
// because these features were dropped in the vitest 4 pool rewrite.

// https://github.com/cloudflare/workers-sdk/commit/4b6fd36ecaca8a94765506e1074a788e39e6beda
const cleanupTest = test.extend<{
	tmpPath: string;
	watchProcess: { current?: Process };
}>({
	// eslint-disable-next-line no-empty-pattern -- Vitest fixture arguments require destructuring.
	async watchProcess({}, use) {
		await use({});
	},
	async tmpPath({ tmpPath, watchProcess, task }, use) {
		await use(tmpPath);
		if (!watchProcess.current && task.result?.state === "fail") {
			return;
		}
		assert.equal(
			watchProcess.current?.closed,
			true,
			"Watch process must close before temporary files are removed"
		);
	},
});

cleanupTest(
	"automatically re-runs unit tests",
	async ({ expect, seed, vitestDev, watchProcess }) => {
		await seed({
			"vitest.config.mts": vitestConfig(),
			"index.ts": dedent /* javascript */ `
			export default {
				async fetch(request, env, ctx) {
					return new Response("wrong");
				}
			}
		`,
			"index.test.ts": dedent /* javascript */ `
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
		watchProcess.current = result;
		await waitFor(() => {
			expect(result.stderr).toMatch("expected 'wrong' to be 'correct'");
			expect(result.stderr).toMatch("Failed Tests 1");
		});

		await seed({
			"index.ts": dedent /* javascript */ `
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
		if (process.platform !== "win32") {
			await result.killParent();
		}
	}
);

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
		"index.ts": dedent /* javascript */ `
			export default {
				async fetch(request, env, ctx) {
					return new Response("wrong");
				}
			}
		`,
		"index.test.ts": dedent /* javascript */ `
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
		"index.ts": dedent /* javascript */ `
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
		"answer.ts": dedent /* javascript */ `
			export function getAnswer() {
				return "wrong";
			}
		`,
		"index.ts": dedent /* javascript */ `
			import { getAnswer } from "./answer";

			export default {
				async fetch(request, env, ctx) {
					const answer = getAnswer();
					return new Response(answer);
				}
			}
		`,
		"index.test.ts": dedent /* javascript */ `
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
		"index.test.ts": dedent /* javascript */ `
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

describe("watch ownership", () => {
	let retained:
		| { directory: string; marker: string; errors: string[] }
		| undefined;

	afterAll(async () => {
		assert(
			retained,
			"The retention regression must acquire its real directory"
		);
		const errors: unknown[] = [];
		try {
			assert.deepEqual(
				retained.errors,
				["Watch ownership is unresolved; temporary directory retained"],
				"The actual tmpPath fixture must reject deletion for its retained owner"
			);
			assert.equal((await fs.stat(retained.directory)).isDirectory(), true);
		} catch (error) {
			errors.push(error);
		}
		const cleanup = await Promise.allSettled([
			removeDir(retained.marker),
			removeDir(retained.directory),
		]);
		for (const result of cleanup) {
			if (result.status === "rejected") {
				errors.push(result.reason);
			}
		}
		if (errors.length) {
			throw new AggregateError(errors, "Retention regression failed");
		}
	});

	// https://github.com/cloudflare/workers-sdk/commit/4b6fd36ecaca8a94765506e1074a788e39e6beda
	test.fails(
		"retains temporary files until watch ownership is released",
		{ retry: 0 },
		async ({ expect, tmpPath }) => {
			const marker = await fs.mkdtemp(
				path.join(
					path.dirname(tmpPath),
					`watch-owner-${path.basename(tmpPath)}-`
				)
			);
			const ownership = { directory: tmpPath, marker, errors: [] as string[] };
			retained = ownership;
			onTestFailed(({ task }) => {
				ownership.errors = (task.result?.errors ?? []).map((error) =>
					String(error.message)
				);
			});
			expect((await fs.stat(tmpPath)).isDirectory()).toBe(true);
		}
	);
});
