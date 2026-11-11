import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

test(
	"vi.mock() without a factory uses the adjacent __mocks__ file",
	{ timeout: 45_000 },
	async ({ expect, seed, vitestRun }) => {
		// Regression test for https://github.com/cloudflare/workers-sdk/issues/7679
		await seed({
			"vitest.config.mts": vitestConfig(),
			"lib.ts": dedent`
				export const value = "real";
			`,
			"__mocks__/lib.ts": dedent`
				export const value = "mocked";
			`,
			"index.test.ts": dedent`
				import { it, expect, vi } from "vitest";
				import { value } from "./lib";
				vi.mock("./lib");
				it("uses the __mocks__ module", () => {
					expect(value).toBe("mocked");
				});
			`,
		});
		const result = await vitestRun();
		expect(await result.exitCode).toBe(0);
	}
);
