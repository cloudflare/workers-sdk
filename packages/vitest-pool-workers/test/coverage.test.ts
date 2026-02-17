import dedent from "ts-dedent";
import { test } from "./helpers";

test("istanbul coverage collects data from workerd runtime", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": dedent`
			import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
			export default defineWorkersConfig({
				test: {
					poolOptions: {
						workers: {
							singleWorker: true,
							miniflare: {
								compatibilityDate: "2024-01-01",
								compatibilityFlags: ["nodejs_compat"],
							},
						},
					},
					coverage: {
						enabled: true,
						provider: "istanbul",
						reporter: ["text"],
					},
				}
			});
		`,
		"src/math.ts": dedent`
			export function add(a: number, b: number): number {
				return a + b;
			}
			export function multiply(a: number, b: number): number {
				return a * b;
			}
			export function divide(a: number, b: number): number {
				if (b === 0) {
					throw new Error("Division by zero");
				}
				return a / b;
			}
		`,
		"src/math.test.ts": dedent`
			import { describe, it, expect } from "vitest";
			import { add, multiply } from "./math";
			describe("math", () => {
				it("adds numbers", () => {
					expect(add(1, 2)).toBe(3);
				});
				it("multiplies numbers", () => {
					expect(multiply(3, 4)).toBe(12);
				});
			});
		`,
	});

	const result = await vitestRun({ flags: ["--coverage"] });
	// Should complete successfully
	await expect(result.exitCode).resolves.toBe(0);
	// Coverage output should contain coverage data (not all zeros)
	// The "text" reporter outputs a table with file names and percentages
	expect(result.stdout).toContain("math.ts");
	// With our tests covering add and multiply but not divide,
	// we should see partial coverage (not 0% and not 100%)
	expect(result.stdout).not.toContain("| 0");
});
