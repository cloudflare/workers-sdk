import fs from "node:fs/promises";
import path from "node:path";
import dedent from "ts-dedent";
import { vi } from "vitest";
import { CloudflarePoolWorker } from "../src/pool/cloudflare-pool-worker";
import { structuredSerializableParse } from "../src/pool/index";
import { test, vitestConfig } from "./helpers";
import type { WorkerRequest } from "vitest/node";

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
						},
					},
					{
						fsModuleCache: true,
						fsModuleCachePath: "./.vitest-cache",
					}
				),
				"helper.ts": "export const value = 42;",
				"mocked.ts": "export const value = 'original';",
				"index.test.ts": dedent`
				import { it, vi } from "vitest";
				import { value } from "./helper";
				import { value as mockedValue } from "./mocked";

				vi.mock("./mocked", () => ({ value: "mocked" }));

				it("loads a transformed module", ({ expect }) => {
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
