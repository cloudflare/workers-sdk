import fs from "node:fs/promises";
import path from "node:path";
import semverMajor from "semver/functions/major.js";
import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";
import { vitestVersion } from "./versions";

const fsModuleCacheOptions = {
	fsModuleCache: true,
	fsModuleCachePath: "./.vitest-cache",
};
const cacheConfig =
	semverMajor(vitestVersion) === 4
		? { experimental: fsModuleCacheOptions }
		: fsModuleCacheOptions;

test(
	"preserves cache-shaped data in unrelated RPC replies",
	{ timeout: 90_000 },
	async ({ expect, seed, tmpPath, vitestRun }) => {
		await seed({
			"vitest.config.mts": vitestConfig(
				{},
				{
					...cacheConfig,
					provide: {
						artifactCachePath: path.join(tmpPath, "artifact-cache.txt"),
						missingCachePath: path.join(tmpPath, "missing-cache.txt"),
					},
				}
			),
			"artifact-cache.txt": "This is artifact data, not a transformed module.",
			"index.test.ts": dedent`
				import { inject, it, recordArtifact } from "vitest";
				import type { TestArtifactBase } from "vitest";

				interface CacheReport extends TestArtifactBase {
					type: "workers-sdk:cache-report";
					cached?: true;
					tmp?: string;
					metadata?: { cached: true; tmp: string };
					missingMetadata?: { cached: true; tmp: string };
				}

				declare module "vitest" {
					interface TestArtifactRegistry {
						cacheReport: CacheReport;
					}
				}

				it("returns artifact data unchanged", async ({ expect, task }) => {
					const cachePath = inject("artifactCachePath");
					const missingPath = inject("missingCachePath");
					const artifacts: CacheReport[] = [
						{ type: "workers-sdk:cache-report", cached: true, tmp: cachePath },
						{
							type: "workers-sdk:cache-report",
							metadata: { cached: true, tmp: cachePath },
							missingMetadata: { cached: true, tmp: missingPath },
						},
					];
					const recorded = await Promise.all(artifacts.map(artifact => recordArtifact(task, artifact)));
					expect(recorded).toEqual(artifacts);
				});
			`,
		});

		const result = await vitestRun();
		expect(await result.exitCode, result.stderr + result.stdout).toBe(0);
	}
);

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
							bindings: { VALUE: 42 },
						},
					},
					cacheConfig
				),
				"helper.ts": "export const value = 42;",
				"mocked.ts": "export const value = 'original';",
				"index.test.ts": dedent`
				import { env } from "cloudflare:test";
				import { it, vi } from "vitest";
				import { value } from "./helper";
				import { value as mockedValue } from "./mocked";

				vi.mock("./mocked", () => ({ value: "mocked" }));

				it("loads a transformed module", ({ expect }) => {
					expect(env.VALUE).toBe(42);
					expect(value).toBe(42);
					expect(mockedValue).toBe("mocked");
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

test(
	"updates cached cloudflare:test imports when Wrangler main changes",
	{ timeout: 90_000 },
	async ({ expect, seed, tmpPath, vitestRun }) => {
		function wranglerConfig(main: string) {
			return JSON.stringify({
				name: "cached-main",
				main: `./${main}.ts`,
				vars: { EXPECTED_MAIN: main },
			});
		}

		await seed({
			"vitest.config.mts": vitestConfig(
				{ wrangler: { configPath: "./wrangler.jsonc" } },
				cacheConfig
			),
			"wrangler.jsonc": wranglerConfig("first"),
			"loaded-main.ts": "export const loadedMains: string[] = [];",
			"first.ts": dedent`
				import { loadedMains } from "./loaded-main";
				loadedMains.push("first");
				export default { fetch() { return new Response("first"); } };
			`,
			"second.ts": dedent`
				import { loadedMains } from "./loaded-main";
				loadedMains.push("second");
				export default { fetch() { return new Response("second"); } };
			`,
			"index.test.ts": dedent`
				import { env, SELF } from "cloudflare:test";
				import { it } from "vitest";
				import { loadedMains } from "./loaded-main";

				it("imports the current main", async ({ expect }) => {
					expect(loadedMains).toEqual([env.EXPECTED_MAIN]);
					expect(await (await SELF.fetch("https://example.com")).text()).toBe(env.EXPECTED_MAIN);
				});
			`,
		});

		const firstRun = await vitestRun();
		expect(await firstRun.exitCode, firstRun.stderr + firstRun.stdout).toBe(0);
		expect(
			(await fs.readdir(path.join(tmpPath, ".vitest-cache"))).length
		).toBeGreaterThan(0);

		// Leave the old entrypoint available so resolving it still succeeds, but
		// importing it from a stale cached module fails the loadedMains assertion.
		await seed({ "wrangler.jsonc": wranglerConfig("second") });
		const secondRun = await vitestRun();
		expect(await secondRun.exitCode, secondRun.stderr + secondRun.stdout).toBe(
			0
		);
	}
);

test(
	"keeps cached cloudflare:test modules project-specific",
	{ timeout: 90_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": dedent`
				import { cloudflareTest } from "@cloudflare/vitest-plugin";

				function project(name) {
					return {
						plugins: [cloudflareTest({
							main: "./" + name + ".ts",
							miniflare: {
								compatibilityDate: "2026-08-10",
								compatibilityFlags: ["nodejs_compat"],
							},
						})],
						test: {
							name,
							...${JSON.stringify(cacheConfig)},
							provide: { expectedMain: name },
						},
					};
				}

				export default { test: { projects: [project("first"), project("second")] } };
			`,
			"loaded-main.ts": "export const loadedMains: string[] = [];",
			"first.ts": dedent`
				import { loadedMains } from "./loaded-main";
				loadedMains.push("first");
				export default { fetch() { return new Response("first"); } };
			`,
			"second.ts": dedent`
				import { loadedMains } from "./loaded-main";
				loadedMains.push("second");
				export default { fetch() { return new Response("second"); } };
			`,
			"index.test.ts": dedent`
				import { SELF } from "cloudflare:test";
				import { inject, it } from "vitest";
				import { loadedMains } from "./loaded-main";

				it("imports only its own main", async ({ expect }) => {
					const expectedMain = inject("expectedMain");
					expect(loadedMains).toEqual([expectedMain]);
					expect(await (await SELF.fetch("https://example.com")).text()).toBe(expectedMain);
				});
			`,
		});

		for (let run = 0; run < 2; run++) {
			const result = await vitestRun();
			expect(await result.exitCode, result.stderr + result.stdout).toBe(0);
			expect(result.stdout).toContain("Tests  2 passed");
		}
	}
);
