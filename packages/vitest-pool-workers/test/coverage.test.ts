import fs from "node:fs/promises";
import path from "node:path";
import dedent from "ts-dedent";
import { test } from "./helpers";

// Regression test for https://github.com/cloudflare/workers-sdk/issues/5825
// Istanbul coverage was reporting 0% for source files exercised by test files
// that ran after the first one. The root cause was that in vitest v1, module
// re-evaluation after `resetModules()` replaced Istanbul's coverage counter
// objects, losing data from earlier test files. This was fixed by the vitest v4
// module runner architecture which correctly preserves counter objects across
// module re-evaluations via hash-based reuse in istanbul-lib-instrument.
test(
	"istanbul coverage reports correctly across multiple test files (#5825)",
	{ timeout: 60_000 },
	async ({ expect, seed, vitestRun, tmpPath }) => {
		await seed({
			"wrangler.jsonc": JSON.stringify({
				name: "coverage-test",
				main: "src/index.ts",
			}),
			"vitest.config.mts": dedent /* javascript */ `
				import { cloudflareTest } from "@cloudflare/vitest-pool-workers"
				import { BaseSequencer } from "vitest/node";

				class DeterministicSequencer extends BaseSequencer {
					sort(files) {
						return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
					}
				}

				export default {
					plugins: [
						cloudflareTest({
							miniflare: {
								compatibilityDate: "2025-12-02",
								compatibilityFlags: ["nodejs_compat"],
							},
							wrangler: {
								configPath: "./wrangler.jsonc",
							},
						})
					],
					test: {
						sequence: { sequencer: DeterministicSequencer },
						testTimeout: 90_000,
						coverage: {
							provider: "istanbul",
							reporter: ["json-summary"],
							include: ["src/**"],
						},
					},
				};
			`,
			// Worker with two routes dispatching to separate source files
			"src/index.ts": dedent /* javascript */ `
				import { greetA } from "./a";
				import { greetB } from "./b";

				export default {
					async fetch(request, env, ctx) {
						if (request.url.endsWith("/a")) {
							return new Response(greetA(request));
						}
						return new Response(greetB(request));
					},
				} satisfies ExportedHandler;
			`,
			"src/a.ts": dedent /* javascript */ `
				export function greetA(request: Request): string {
					return "A: " + request.url;
				}
			`,
			"src/b.ts": dedent /* javascript */ `
				export function greetB(request: Request): string {
					return "B: " + request.url;
				}
			`,
			// Two test files exercising different routes — a.test.ts runs first
			"a.test.ts": dedent /* javascript */ `
				import { SELF } from "cloudflare:test";
				import { it, expect } from "vitest";

				it("routes to a", async () => {
					const response = await SELF.fetch("http://example.com/a");
					expect(await response.text()).toBe("A: http://example.com/a");
				});
			`,
			"b.test.ts": dedent /* javascript */ `
				import { SELF } from "cloudflare:test";
				import { it, expect } from "vitest";

				it("routes to b", async () => {
					const response = await SELF.fetch("http://example.com/b");
					expect(await response.text()).toBe("B: http://example.com/b");
				});
			`,
		});
		const result = await vitestRun({ flags: ["--coverage"] });
		expect(await result.exitCode).toBe(0);

		// Read the JSON coverage summary to verify actual coverage values
		const summaryPath = path.join(tmpPath, "coverage", "coverage-summary.json");
		const summaryJson = JSON.parse(await fs.readFile(summaryPath, "utf8"));

		// Find coverage for a.ts and b.ts (keys are absolute paths)
		const entries = Object.entries(summaryJson) as [
			string,
			{ functions: { pct: number } },
		][];
		const aCoverage = entries.find(([k]) => k.endsWith("/src/a.ts"))?.[1];
		const bCoverage = entries.find(([k]) => k.endsWith("/src/b.ts"))?.[1];

		// The bug: b.ts showed 0% coverage when both files ran together,
		// because its counters were lost during module re-evaluation.
		// Both files should now report non-zero function coverage.
		expect(aCoverage?.functions.pct).toBeGreaterThan(0);
		expect(bCoverage?.functions.pct).toBeGreaterThan(0);
	}
);
