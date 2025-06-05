import dedent from "ts-dedent";
import { minimalVitestConfig, test } from "./helpers";

test("filter test suite by pattern includes non-ascii string", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": minimalVitestConfig,
		"index.test.ts": dedent`
            import { it, expect } from "vitest";

            it("test includes 日本語", async () => {
                expect(1).toBe(1)
            });

            it("test not includes 日本語", async () => {
                expect(1).toBe(2)
            });
        `,
	});

	const result = await vitestRun({
		flags: ['--testNamePattern="test includes 日本語"'],
	});

	expect(result.stdout).toContain("index.test.ts (2 tests | 1 skipped)");
	expect(await result.exitCode).toBe(0);
});
