import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

for (const fsModuleCache of [undefined, true]) {
	test(`runs Worker tests with fsModuleCache configured as ${fsModuleCache}`, async ({
		expect,
		seed,
		vitestRun,
	}) => {
		await seed({
			"vitest.config.mts": vitestConfig({}, { fsModuleCache }),
			"helper.ts": "export const value = 42;",
			"index.test.ts": dedent`
				import { it } from "vitest";
				import { value } from "./helper";

				it("loads transformed modules", ({ expect }) => {
					expect(value).toBe(42);
				});
			`,
		});

		const result = await vitestRun();
		expect(await result.exitCode).toBe(0);
	});
}
