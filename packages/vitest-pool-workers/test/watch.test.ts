import dedent from "ts-dedent";
import { minimalVitestConfig, test, waitFor } from "./helpers";

const durableObjectWorker = dedent`
	export class Counter {
		count = 0;

		constructor(readonly state: DurableObjectState) {
			void state.blockConcurrencyWhile(async () => {
				this.count = (await state.storage.get("count")) ?? 0;
			});
		}

		fetch(request: Request) {
			this.count++;
			void this.state.storage.put("count", this.count);
			return new Response(this.count.toString());
		}
	}

	export default {
		fetch(request: Request, env: any) {
			const { pathname } = new URL(request.url);
			const id = env.COUNTER.idFromName(pathname);
			const stub = env.COUNTER.get(id);
			return stub.fetch(request);
		}
	}
`;

function makeDurableObjectConfig(isolatedStorage: boolean) {
	return dedent`
		import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
		export default defineWorkersConfig({
			test: {
				poolOptions: {
					workers: {
						main: "./index.ts",
						singleWorker: true,
						isolatedStorage: ${isolatedStorage},
						miniflare: {
							compatibilityDate: "2024-01-01",
							compatibilityFlags: ["nodejs_compat"],
							durableObjects: {
								COUNTER: "Counter",
							},
						},
					},
				},
			}
		});
	`;
}

// when isolatedStorage: true storage be reset at every test
const isolatedStorageTests = dedent`
	import { SELF } from "cloudflare:test";
	import { it, expect } from "vitest";

	it("first test: verifies incrementing works", async () => {
		// First fetch returns 1
		let response = await SELF.fetch("https://example.com/test-path");
		expect(await response.text()).toBe("1");
		// Second fetch returns 2 (counter increments)
		response = await SELF.fetch("https://example.com/test-path");
		expect(await response.text()).toBe("2");
		// Third fetch returns 3
		response = await SELF.fetch("https://example.com/test-path");
		expect(await response.text()).toBe("3");
	});

	it("second test: storage is reset, starts at 1 again", async () => {
		// With isolatedStorage: true, storage is reset between tests
		const response = await SELF.fetch("https://example.com/test-path");
		expect(await response.text()).toBe("1");
	});

	it("third test: storage is reset, starts at 1 again", async () => {
		// With isolatedStorage: true, storage is reset between tests
		const response = await SELF.fetch("https://example.com/test-path");
		expect(await response.text()).toBe("1");
	});
`;

// when isolatedStorage: false storage should leak in between tests
const sharedStorageTests = dedent`
	import { SELF } from "cloudflare:test";
	import { it, expect } from "vitest";

	it("first increment", async () => {
		const response = await SELF.fetch("https://example.com/test-path");
		// First test in a run should always see "1" (storage reset between runs)
		expect(await response.text()).toBe("1");
	});

	it("second increment", async () => {
		const response = await SELF.fetch("https://example.com/test-path");
		// With isolatedStorage: false, storage leaks between tests
		expect(await response.text()).toBe("2");
	});

	it("third increment", async () => {
		const response = await SELF.fetch("https://example.com/test-path");
		// With isolatedStorage: false, storage leaks between tests
		expect(await response.text()).toBe("3");
	});
`;

test(
	"DO storage is reset between vitest runs (isolatedStorage: true)",
	{ timeout: 60_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": makeDurableObjectConfig(true),
			"index.ts": durableObjectWorker,
			"index.test.ts": isolatedStorageTests,
		});

		let result = await vitestRun();
		expect(result.stdout).toMatch(/Tests.*3 passed/s);
		expect(await result.exitCode).toBe(0);

		result = await vitestRun();
		expect(result.stdout).toMatch(/Tests.*3 passed/s);
		expect(await result.exitCode).toBe(0);
	}
);

test(
	"DO storage is reset between vitest runs (isolatedStorage: false)",
	{ timeout: 60_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": makeDurableObjectConfig(false),
			"index.ts": durableObjectWorker,
			"index.test.ts": sharedStorageTests,
		});

		let result = await vitestRun();
		expect(result.stdout).toMatch(/Tests.*3 passed/s);
		expect(await result.exitCode).toBe(0);

		result = await vitestRun();
		expect(result.stdout).toMatch(/Tests.*3 passed/s);
		expect(await result.exitCode).toBe(0);
	}
);

test(
	"DO storage is reset in watch mode (isolatedStorage: true)",
	{ timeout: 50000 },
	async ({ expect, seed, vitestDev }) => {
		await seed({
			"vitest.config.mts": makeDurableObjectConfig(true),
			"index.ts": durableObjectWorker,
			"index.test.ts": isolatedStorageTests,
		});

		const result = vitestDev();

		await waitFor(() => {
			expect(result.stdout).toMatch(/Tests.*3 passed/s);
		});

		await seed({
			"index.test.ts": isolatedStorageTests + "\n// trigger re-run",
		});

		await waitFor(() => {
			const matches = result.stdout.match(/Tests\s+3 passed/g);
			expect(matches?.length).toBeGreaterThanOrEqual(2);
		});
	}
);

test(
	"DO storage is reset in watch mode (isolatedStorage: false)",
	{ timeout: 50000 },
	async ({ expect, seed, vitestDev }) => {
		await seed({
			"vitest.config.mts": makeDurableObjectConfig(false),
			"index.ts": durableObjectWorker,
			"index.test.ts": sharedStorageTests,
		});

		const result = vitestDev();

		await waitFor(() => {
			expect(result.stdout).toMatch(/Tests.*3 passed/s);
		});

		await seed({
			"index.test.ts": sharedStorageTests + "\n// trigger re-run",
		});

		await waitFor(() => {
			const matches = result.stdout.match(/Tests\s+3 passed/g);
			expect(matches?.length).toBeGreaterThanOrEqual(2);
		});
	}
);

test("automatically re-runs unit tests", async ({
	expect,
	seed,
	vitestDev,
}) => {
	await seed({
		"vitest.config.mts": minimalVitestConfig,
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
					return new Response("wrong");
				}
			}
		`,
		"index.test.ts": dedent`
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

test("automatically reset module graph", async ({
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
		"answer.ts": dedent`
			export function getAnswer() {
				return "wrong";
			}
		`,
		"index.ts": dedent`
			import { getAnswer } from "./answer";

			export default {
				async fetch(request, env, ctx) {
					const answer = getAnswer();
					return new Response(answer);
				}
			}
		`,
		"index.test.ts": dedent`
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
		"index.test.ts": dedent`
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
