import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

// https://github.com/cloudflare/workers-sdk/issues/7679
// `vi.mock(path)` without a factory should use the module in the matching
// `__mocks__` directory, as it does in Node.js, rather than automocking.

test(
	"uses the root __mocks__ directory for a dependency mocked without a factory",
	{ timeout: 90_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": vitestConfig(),
			"node_modules/mocked-dependency/package.json": JSON.stringify({
				name: "mocked-dependency",
				version: "1.0.0",
				type: "module",
				main: "index.js",
			}),
			"node_modules/mocked-dependency/index.js": dedent /* javascript */ `
				export function v4() {
					return "original";
				}
			`,
			"__mocks__/mocked-dependency.ts": dedent /* javascript */ `
				export const v4 = () => "expected";
			`,
			"index.test.ts": dedent /* javascript */ `
				import { v4 } from "mocked-dependency";
				import { it, vi } from "vitest";

				vi.mock("mocked-dependency");

				it("uses the __mocks__ module", ({ expect }) => {
					expect(v4()).toBe("expected");
				});
			`,
		});

		const result = await vitestRun();
		expect(await result.exitCode, result.stderr + result.stdout).toBe(0);
		expect(result.stdout).toMatch("Tests  1 passed");
	}
);

test(
	"uses the adjacent __mocks__ directory for a local module mocked without a factory",
	{ timeout: 90_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": vitestConfig(),
			"answer.ts": dedent /* javascript */ `
				export function getAnswer() {
					return "original";
				}
			`,
			"__mocks__/answer.ts": dedent /* javascript */ `
				export function getAnswer() {
					return "expected";
				}
			`,
			"index.test.ts": dedent /* javascript */ `
				import { it, vi } from "vitest";
				import { getAnswer } from "./answer";

				vi.mock("./answer");

				it("uses the __mocks__ module", ({ expect }) => {
					expect(getAnswer()).toBe("expected");
				});
			`,
		});

		const result = await vitestRun();
		expect(await result.exitCode, result.stderr + result.stdout).toBe(0);
		expect(result.stdout).toMatch("Tests  1 passed");
	}
);
