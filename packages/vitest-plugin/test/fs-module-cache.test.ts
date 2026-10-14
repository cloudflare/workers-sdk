import fs from "node:fs/promises";
import path from "node:path";
import dedent from "ts-dedent";
import { vi } from "vitest";
import { version as installedVitestVersion } from "vitest/package.json";
import { CloudflarePoolWorker } from "../src/pool/cloudflare-pool-worker";
import { structuredSerializableParse } from "../src/pool/index";
import { test, vitestConfig } from "./helpers";
import type { WorkerRequest } from "vitest/node";

const fsModuleCacheOptions = {
	fsModuleCache: true,
	fsModuleCachePath: "./.vitest-cache",
};
const cacheConfig = (
	process.env.VITEST_VERSION ?? installedVitestVersion
).startsWith("4.")
	? { experimental: fsModuleCacheOptions }
	: fsModuleCacheOptions;

test("inlines cached fetches with Vitest 4's experimental setting", async ({
	expect,
	tmpPath,
}) => {
	const cachedPath = path.join(tmpPath, "cached-module.js");
	await fs.writeFile(cachedPath, "export const value = 42;");
	const send = vi.fn();
	const worker = Object.create(
		CloudflarePoolWorker.prototype
	) as CloudflarePoolWorker;
	Object.assign(worker, {
		socket: { send },
		parsedPoolOptions: {},
		options: { project: { config: { experimental: { fsModuleCache: true } } } },
	});

	worker.send({
		t: "s",
		i: 1,
		r: { cached: true, tmp: cachedPath },
	} as unknown as WorkerRequest);

	const response = structuredSerializableParse(send.mock.calls[0][0]) as {
		r: unknown;
	};
	expect(response.r).toEqual({ code: "export const value = 42;" });
});

test("forwards a cached fetch when its file disappears", ({
	expect,
	tmpPath,
}) => {
	const send = vi.fn();
	const worker = Object.create(
		CloudflarePoolWorker.prototype
	) as CloudflarePoolWorker;
	Object.assign(worker, {
		socket: { send },
		parsedPoolOptions: {},
		options: { project: { config: { fsModuleCache: true } } },
	});
	const message = {
		t: "s",
		i: 1,
		r: { cached: true, tmp: path.join(tmpPath, "missing.js") },
	};

	worker.send(message as unknown as WorkerRequest);

	expect(structuredSerializableParse(send.mock.calls[0][0])).toEqual(message);
});

test("inlines warm-cache entries and skips missing files", async ({
	expect,
	tmpPath,
}) => {
	const cachedPath = path.join(tmpPath, "cached-module.js");
	await fs.writeFile(cachedPath, "export const value = 42;");
	const send = vi.fn();
	const worker = Object.create(
		CloudflarePoolWorker.prototype
	) as CloudflarePoolWorker;
	Object.assign(worker, {
		socket: { send },
		parsedPoolOptions: {},
		options: { project: { config: { fsModuleCache: true } } },
	});

	worker.send({
		t: "s",
		i: 1,
		r: {
			"/missing": { cached: true, tmp: path.join(tmpPath, "missing.js") },
			"/cached": { cached: true, tmp: cachedPath },
			"/cached-alias": { cached: true, tmp: cachedPath },
		},
	} as unknown as WorkerRequest);

	const response = structuredSerializableParse(send.mock.calls[0][0]) as {
		r: unknown;
	};
	expect(response.r).toEqual({
		"/cached": { code: "export const value = 42;" },
		"/cached-alias": { code: "export const value = 42;" },
	});
});

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
