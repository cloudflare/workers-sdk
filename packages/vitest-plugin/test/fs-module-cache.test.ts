import fs from "node:fs/promises";
import path from "node:path";
import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

for (const moduleRegistry of [
	"legacy_module_registry",
	"new_module_registry",
]) {
	test(
		`loads cached modules with ${moduleRegistry}`,
		{ timeout: 90_000 },
		async ({ expect, seed, tmpPath, vitestRun }) => {
			await seed({
				"vitest.config.mts": vitestConfig(
					{
						miniflare: {
							compatibilityDate: "2026-08-10",
							compatibilityFlags: [moduleRegistry],
						},
					},
					{
						fsModuleCache: true,
						fsModuleCachePath: "./.vitest-cache",
					}
				),
				"helper.ts": "export const value = 42;",
				"index.test.ts": dedent`
				import { it } from "vitest";
				import { value } from "./helper";

				it("loads a transformed module", ({ expect }) => {
					expect(value).toBe(42);
				});
			`,
			});

			const firstRun = await vitestRun();
			expect(await firstRun.exitCode, firstRun.stderr + firstRun.stdout).toBe(
				0
			);
			expect(
				(await fs.readdir(path.join(tmpPath, ".vitest-cache"))).length
			).toBeGreaterThan(0);

			const secondRun = await vitestRun();
			expect(
				await secondRun.exitCode,
				secondRun.stderr + secondRun.stdout
			).toBe(0);
		}
	);
}
