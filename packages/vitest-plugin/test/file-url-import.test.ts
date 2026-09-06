import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

test(
	"resolves dynamic file:// URL imports in paths with spaces",
	{ timeout: 45_000 },
	async ({ expect, seed, vitestRun }) => {
		// Regression test for https://github.com/cloudflare/workers-sdk/issues/14107
		// When the project path contains spaces, dynamic imports using file:// URLs
		// (e.g. constructed via import.meta.url) would double-encode %20 → %2520,
		// causing workerd to fail with "No such module".
		await seed({
			"vitest.config.mts": vitestConfig({
				miniflare: {
					compatibilityDate: "2025-12-02",
					compatibilityFlags: ["nodejs_compat"],
				},
			}),
			"helper.ts": dedent`
				export const value = 42;
			`,
			"index.test.ts": dedent`
				import { it, expect } from "vitest";
				it("can dynamically import via file:// URL", async () => {
					const helperUrl = new URL("./helper.ts", import.meta.url);
					expect(helperUrl.protocol).toBe("file:");
					const mod = await import(helperUrl.href);
					expect(mod.value).toBe(42);
				});
			`,
		});
		const result = await vitestRun();
		expect(result.stderr).not.toContain("%2520");
		expect(await result.exitCode).toBe(0);
	}
);
