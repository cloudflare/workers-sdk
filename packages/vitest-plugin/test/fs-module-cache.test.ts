import fs from "node:fs/promises";
import path from "node:path";
import dedent from "ts-dedent";
import { vi } from "vitest";
import { CloudflarePoolWorker } from "../src/pool/cloudflare-pool-worker";
import { structuredSerializableParse } from "../src/pool/index";
import { test, vitestConfig, waitFor } from "./helpers";
import type { WorkerRequest } from "vitest/node";

function createRpcSender(
	transforms: Record<
		string,
		Record<string, { code: string; __vitestTmp: string }>
	> = {}
) {
	const send = vi.fn();
	const worker = Object.create(
		CloudflarePoolWorker.prototype
	) as CloudflarePoolWorker;
	Object.assign(worker, {
		socket: { send },
		parsedPoolOptions: {},
		options: {
			project: {
				config: { fsModuleCache: true },
				vite: {
					environments: Object.fromEntries(
						Object.entries(transforms).map(([name, modules]) => [
							name,
							{
								moduleGraph: {
									getModuleById(id: string) {
										return { transformResult: modules[id] };
									},
								},
							},
						])
					),
				},
			},
		},
	});

	return function sendResponse(result: unknown) {
		worker.send({ t: "s", i: 1, r: result } as unknown as WorkerRequest);
		return structuredSerializableParse(send.mock.lastCall?.[0]) as {
			r: unknown;
			e?: Error;
		};
	};
}

test("inlines cached fetches without reading their cache files", ({
	expect,
}) => {
	const sendResponse = createRpcSender({
		ssr: {
			"/module.ts": {
				code: "export const value = 42;",
				__vitestTmp: "/missing.js",
			},
		},
	});
	const metadata = {
		id: "/module.ts",
		url: "/module.ts",
		file: "/project/module.ts",
		invalidate: false,
		moduleType: "module",
	};
	const response = sendResponse({
		...metadata,
		cached: true,
		tmp: "/missing.js",
	});
	expect(response.r).toEqual({ ...metadata, code: "export const value = 42;" });
});

test("matches the cache path when selecting an environment's transform", ({
	expect,
}) => {
	const sendResponse = createRpcSender({
		client: {
			"/module.ts": { code: "wrong environment", __vitestTmp: "/client.js" },
		},
		ssr: {
			"/module.ts": { code: "correct environment", __vitestTmp: "/ssr.js" },
		},
	});
	expect(
		sendResponse({ cached: true, id: "/module.ts", tmp: "/ssr.js" }).r
	).toEqual({
		id: "/module.ts",
		code: "correct environment",
	});
});

test("omits invalidated warm entries and preserves aliases and externals", ({
	expect,
}) => {
	const sendResponse = createRpcSender({
		ssr: {
			"/cached.ts": {
				code: "export const value = 42;",
				__vitestTmp: "/missing.js",
			},
			"/invalidated.ts": { code: "stale", __vitestTmp: "/different.js" },
		},
	});
	const cachedModule = { cached: true, id: "/cached.ts", tmp: "/missing.js" };
	const external = { externalize: "node:test", type: "builtin" };
	const response = sendResponse({
		"/invalidated.ts": {
			cached: true,
			id: "/invalidated.ts",
			tmp: "/original.js",
		},
		"/cached.ts": cachedModule,
		"/project/cached.ts": cachedModule,
		"node:test": external,
	});
	const inlinedModule = { id: "/cached.ts", code: "export const value = 42;" };
	expect(response.r).toEqual({
		"/cached.ts": inlinedModule,
		"/project/cached.ts": inlinedModule,
		"node:test": external,
	});
});

test("reports an invalidated cached fetch as an RPC error", ({ expect }) => {
	const response = createRpcSender()({
		cached: true,
		id: "/module.ts",
		tmp: "/missing.js",
	});
	expect(response.r).toBeUndefined();
	expect(response.e).toBeInstanceOf(Error);
	expect(response.e?.message).toBe(
		"The cached module transform is no longer available."
	);
});

test("preserves unrelated RPC results", ({ expect }) => {
	const result = { metadata: { value: undefined }, values: [1, 2, 3] };
	expect(createRpcSender()(result).r).toEqual(result);
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

	test(
		`invalidates cached transforms in watch mode with ${moduleRegistry}`,
		{ timeout: 90_000 },
		async ({ expect, seed, vitestDev }) => {
			await seed({
				"vitest.config.mts": vitestConfig(
					{
						miniflare: {
							compatibilityDate: "2026-08-10",
							compatibilityFlags: [moduleRegistry],
						},
					},
					{ fsModuleCache: true, fsModuleCachePath: "./.vitest-cache" }
				),
				"helper.ts": "export const value = 41;",
				"index.test.ts": dedent`
					import { it } from "vitest";
					import { value } from "./helper";

					it("loads the latest transform", ({ expect }) => {
						expect(value).toBe(42);
					});
				`,
			});
			const result = vitestDev();
			await waitFor(() => {
				expect(result.stderr).toContain("expected 41 to be 42");
			}, 30_000);
			await seed({ "helper.ts": "export const value = 42;" });
			await waitFor(() => {
				expect(result.stdout).toContain("Tests  1 passed");
			}, 30_000);
		}
	);
}
