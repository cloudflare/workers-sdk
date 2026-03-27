import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

test("waitForWaitUntil abandons promises that never resolve", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig(),
		"index.test.ts": dedent`
				import {
					setWaitUntilTimeout,
					waitForWaitUntil,
				} from "cloudflare:test-internal";
				import { expect, it } from "vitest";

				it("returns after timeout instead of hanging", async () => {
					setWaitUntilTimeout(100);
					const waitUntil = [new Promise(() => {})];
					await waitForWaitUntil(waitUntil);
					// If we get here, the timeout worked — the function didn't hang
					expect(waitUntil).toHaveLength(0);
				});
			`,
	});
	const result = await vitestRun();
	expect(await result.exitCode).toBe(0);
	const output = result.stdout + result.stderr;
	expect(output).toContain("waitUntil promise(s) did not resolve within");
});
