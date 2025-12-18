import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

test("filter test suite by pattern includes non-ascii string", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig(),
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

	// This test is checking that we can pass non-ASCII characters in the test name filtering pattern.
	// Note that Windows requires the pattern to be wrapped in double quotes, not single.
	const result = await vitestRun({
		flags: ['--testNamePattern="test includes 日本語"'],
	});

	// If that filtering fails then either no tests will be run or both tests, including the failing test will run,
	// in either case the test run will result in an error.
	expect(result.stdout).toContain("index.test.ts (2 tests | 1 skipped)");
	expect(await result.exitCode).toBe(0);
});
