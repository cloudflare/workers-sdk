import path from "node:path";
import dedent from "ts-dedent";
import { describe } from "vitest";
import { test, vitestConfig } from "./helpers";

test(
	"formats config validation errors",
	{ timeout: 45_000 },
	async ({ expect, seed, vitestRun, tmpPath }) => {
		const tmpPathName = path.basename(tmpPath);

		// Check top-level options validated
		await seed({
			"vitest.config.mts": vitestConfig({
				miniflare: [],
				wrangler: "./wrangler.toml",
			}),
			"index.test.ts": "",
		});
		let result = await vitestRun();
		expect(await result.exitCode).toBe(1);
		let expected = dedent`
			TypeError: Unexpected options in project ${path.join(tmpPathName, "vitest.config.mts")}:
			{
			  miniflare: [],
			             ^ Expected object, received array
			  wrangler: './wrangler.toml',
			            ^ Expected object, received string
			}
		`;
		expect(result.stderr).toMatch(expected);

		// Check `miniflare` options validated with correct error paths
		await seed({
			"vitest.config.mts": vitestConfig({
				miniflare: {
					compatibilityDate: { year: 2024, month: 1, day: 1 },
				},
			}),
			"index.test.ts": "",
		});
		result = await vitestRun();
		expect(await result.exitCode).toBe(1);
		expected = dedent`
			TypeError: Unexpected options in project ${path.join(tmpPathName, "vitest.config.mts")}:
			{
			  miniflare: {
			    compatibilityDate: { year: 2024, month: 1, day: 1 },
			                       ^ Expected string, received object
			  },
			}
		`;
		expect(result.stderr).toMatch(expected);
	}
);

test(
	"requires modules entrypoint to use SELF",
	{ timeout: 45_000 },
	async ({ expect, seed, vitestRun, tmpPath }) => {
		const tmpPathName = path.basename(tmpPath);

		// Check with no entrypoint
		await seed({
			"vitest.config.mts": vitestConfig({
				miniflare: {
					compatibilityDate: "2025-12-02",
					compatibilityFlags: ["nodejs_compat"],
				},
			}),
			"index.test.ts": dedent /* javascript */ `
				import { SELF } from "cloudflare:test";
				import { it, expect } from "vitest";
				it("sends request", async () => {
					const response = await SELF.fetch("https://example.com/");
					expect(response.ok).toBe(true);
				});
			`,
		});
		let result = await vitestRun();
		expect(await result.exitCode).toBe(1);
		let expected = dedent`
			Error: Using service bindings to the current worker requires \`poolOptions.workers.main\` to be set to your worker's entrypoint
		`;
		expect(result.stderr).toMatch(expected);

		// Check with service worker
		await seed({
			"vitest.config.mts": vitestConfig({
				main: "./index.ts",
				miniflare: {
					compatibilityDate: "2025-12-02",
					compatibilityFlags: ["nodejs_compat"],
				},
			}),
			"index.ts": dedent /* javascript */ `
				addEventListener("fetch", (event) => {
					event.respondWith(new Response("body"));
				});
			`,
		});
		result = await vitestRun();
		expect(await result.exitCode).toBe(1);
		expected = dedent`
			${path.join(tmpPathName, "index.ts")} does not export a default entrypoint. \`@cloudflare/vitest-pool-workers\` does not support service workers or named entrypoints for \`SELF\`.
			If you're using service workers, please migrate to the modules format: https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
		`;
		expect(result.stderr).toMatch(expected);
	}
);

test(
	"reports unavailable Node imports without crashing workerd",
	{ timeout: 60_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": dedent`
				import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

				export default {
					plugins: [
						cloudflareTest({
							wrangler: { configPath: "./wrangler.jsonc" },
						}),
					],
					test: { testTimeout: 90_000 },
				};
			`,
			"wrangler.jsonc": dedent`
				{
					"name": "unavailable-node-import",
					"main": "src/index.ts",
					"compatibility_date": "2025-12-02"
				}
			`,
			"src/index.ts": dedent`
				import "node:child_process";

				export default {
					async fetch() {
						return new Response("ok");
					},
				};
			`,
			"index.test.ts": dedent`
				import { SELF } from "cloudflare:test";
				import { it } from "vitest";

				it("sends request", async ({ expect }) => {
					const response = await SELF.fetch("https://example.com/");
					expect(response.ok).toBe(true);
				});
			`,
		});

		let result = await vitestRun();
		expect(await result.exitCode).toBe(1);
		expect(result.stderr).toContain('No such module "node:child_process"');
		expect(result.stderr).not.toMatch(
			/Received signal #11|Segmentation fault|Worker exited unexpectedly/
		);

		await seed({
			"wrangler.jsonc": dedent`
				{
					"name": "unavailable-node-import",
					"main": "src/index.ts",
					"compatibility_date": "2026-03-17",
					"compatibility_flags": ["nodejs_compat"]
				}
			`,
		});
		result = await vitestRun();
		expect(await result.exitCode).toBe(0);
		expect(result.stderr).not.toMatch(
			/Received signal #11|Segmentation fault|Worker exited unexpectedly/
		);

		// A gated builtin outside the original hardcoded set (`node:punycode`,
		// enabled from 2025-12-04) must also report a clean module error rather
		// than crashing workerd through the fallback redirect.
		await seed({
			"wrangler.jsonc": dedent`
				{
					"name": "unavailable-node-import",
					"main": "src/index.ts",
					"compatibility_date": "2025-12-02",
					"compatibility_flags": ["nodejs_compat"]
				}
			`,
			"src/index.ts": dedent`
				import "node:punycode";

				export default {
					async fetch() {
						return new Response("ok");
					},
				};
			`,
		});
		result = await vitestRun();
		expect(await result.exitCode).toBe(1);
		expect(result.stderr).toContain('No such module "node:punycode"');
		expect(result.stderr).not.toMatch(
			/Received signal #11|Segmentation fault|Worker exited unexpectedly/
		);

		// `node:_http_server` sits behind a second sub-gate of the http override
		// (enabled from 2025-09-01) that the pool does not force-enable, so at an
		// earlier date it must report a clean module error rather than crash.
		await seed({
			"wrangler.jsonc": dedent`
				{
					"name": "unavailable-node-import",
					"main": "src/index.ts",
					"compatibility_date": "2025-08-31",
					"compatibility_flags": ["nodejs_compat"]
				}
			`,
			"src/index.ts": dedent`
				import "node:_http_server";

				export default {
					async fetch() {
						return new Response("ok");
					},
				};
			`,
		});
		result = await vitestRun();
		expect(await result.exitCode).toBe(1);
		expect(result.stderr).toContain('No such module "node:_http_server"');
		expect(result.stderr).not.toMatch(
			/Received signal #11|Segmentation fault|Worker exited unexpectedly/
		);
	}
);

test(
	"reports unavailable Node requires without crashing workerd",
	{ timeout: 60_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": dedent`
				import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

				export default {
					plugins: [
						cloudflareTest({
							wrangler: { configPath: "./wrangler.jsonc" },
						}),
					],
					test: { testTimeout: 90_000 },
				};
			`,
			"wrangler.jsonc": dedent`
				{
					"name": "unavailable-node-require",
					"main": "src/index.ts",
					"compatibility_date": "2025-12-02",
					"compatibility_flags": ["nodejs_compat"]
				}
			`,
			"src/index.ts": dedent`
				import "./dep.cjs";

				export default {
					async fetch() {
						return new Response("ok");
					},
				};
			`,
			"src/dep.cjs": dedent`
				module.exports = require("node:child_process");
			`,
			"index.test.ts": dedent`
				import { SELF } from "cloudflare:test";
				import { it } from "vitest";

				it("sends request", async ({ expect }) => {
					const response = await SELF.fetch("https://example.com/");
					expect(response.ok).toBe(true);
				});
			`,
		});

		let result = await vitestRun();
		expect(await result.exitCode).toBe(1);
		expect(result.stderr).toContain('No such module "node:child_process"');
		expect(result.stderr).not.toMatch(
			/Received signal #11|Segmentation fault|Worker exited unexpectedly/
		);

		await seed({
			"wrangler.jsonc": dedent`
				{
					"name": "unavailable-node-require",
					"main": "src/index.ts",
					"compatibility_date": "2025-12-02",
					"compatibility_flags": ["nodejs_compat", "enable_nodejs_child_process_module"]
				}
			`,
		});
		result = await vitestRun();
		expect(await result.exitCode).toBe(0);
		expect(result.stderr).not.toMatch(
			/Received signal #11|Segmentation fault|Worker exited unexpectedly/
		);

		await seed({
			"wrangler.jsonc": dedent`
				{
					"name": "unavailable-node-require",
					"main": "src/index.ts",
					"compatibility_date": "2025-12-02",
					"compatibility_flags": ["nodejs_compat"]
				}
			`,
			"src/dep.cjs": dedent`
				module.exports = require("node:assert");
			`,
		});
		result = await vitestRun();
		expect(await result.exitCode).toBe(0);
		expect(result.stderr).not.toMatch(
			/Received signal #11|Segmentation fault|Worker exited unexpectedly/
		);

		// A gated builtin outside the original hardcoded set (`node:punycode`,
		// enabled from 2025-12-04) must also report a clean module error rather
		// than crashing workerd through the fallback redirect.
		await seed({
			"wrangler.jsonc": dedent`
				{
					"name": "unavailable-node-require",
					"main": "src/index.ts",
					"compatibility_date": "2025-12-02",
					"compatibility_flags": ["nodejs_compat"]
				}
			`,
			"src/dep.cjs": dedent`
				module.exports = require("node:punycode");
			`,
		});
		result = await vitestRun();
		expect(await result.exitCode).toBe(1);
		expect(result.stderr).toContain('No such module "node:punycode"');
		expect(result.stderr).not.toMatch(
			/Received signal #11|Segmentation fault|Worker exited unexpectedly/
		);

		// `node:_http_server` sits behind a second sub-gate of the http override
		// (enabled from 2025-09-01) that the pool does not force-enable, so at an
		// earlier date it must report a clean module error rather than crash.
		await seed({
			"wrangler.jsonc": dedent`
				{
					"name": "unavailable-node-require",
					"main": "src/index.ts",
					"compatibility_date": "2025-08-31",
					"compatibility_flags": ["nodejs_compat"]
				}
			`,
			"src/dep.cjs": dedent`
				module.exports = require("node:_http_server");
			`,
		});
		result = await vitestRun();
		expect(await result.exitCode).toBe(1);
		expect(result.stderr).toContain('No such module "node:_http_server"');
		expect(result.stderr).not.toMatch(
			/Received signal #11|Segmentation fault|Worker exited unexpectedly/
		);
	}
);

describe("coverage provider validation", () => {
	test(
		"rejects v8 coverage provider with a clear error",
		{ timeout: 45_000 },
		async ({ expect, seed, vitestRun }) => {
			await seed({
				"vitest.config.mts": vitestConfig(
					{},
					{ coverage: { enabled: true, provider: "v8" } }
				),
				"index.test.ts": dedent /* javascript */ `
				import { it, expect } from "vitest";
				it("works", () => {
					expect(1 + 1).toBe(2);
				});
			`,
			});
			const result = await vitestRun();
			expect(await result.exitCode).toBe(1);
			expect(result.stderr).toMatch(
				'Coverage provider "v8" is not supported by `@cloudflare/vitest-pool-workers`'
			);
			expect(result.stderr).toMatch("Use Istanbul instead");
		}
	);

	test(
		"rejects default coverage provider (v8) with a clear error",
		{ timeout: 45_000 },
		async ({ expect, seed, vitestRun }) => {
			// When no provider is specified, Vitest defaults to v8
			await seed({
				"vitest.config.mts": vitestConfig({}, { coverage: { enabled: true } }),
				"index.test.ts": dedent /* javascript */ `
				import { it, expect } from "vitest";
				it("works", () => {
					expect(1 + 1).toBe(2);
				});
			`,
			});
			const result = await vitestRun();
			expect(await result.exitCode).toBe(1);
			expect(result.stderr).toMatch(
				'Coverage provider "v8" is not supported by `@cloudflare/vitest-pool-workers`'
			);
		}
	);

	test(
		"allows istanbul coverage provider",
		{ timeout: 60_000 },
		async ({ expect, seed, vitestRun }) => {
			await seed({
				"vitest.config.mts": vitestConfig(
					{},
					{ coverage: { enabled: true, provider: "istanbul" } }
				),
				"index.test.ts": dedent /* javascript */ `
				import { it, expect } from "vitest";
				it("works", () => {
					expect(1 + 1).toBe(2);
				});
			`,
			});
			const result = await vitestRun();
			// Should not fail with a coverage provider error
			expect(result.stderr).not.toMatch(
				'Coverage provider "v8" is not supported'
			);
		}
	);
});
