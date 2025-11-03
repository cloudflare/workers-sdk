import path from "node:path";
import dedent from "ts-dedent";
import { test } from "./helpers";

test(
	"formats config validation errors",
	{ timeout: 45_000 },
	async ({ expect, seed, vitestRun, tmpPath }) => {
		const tmpPathName = path.basename(tmpPath);

		// Check top-level options validated
		await seed({
			"vitest.config.mts": dedent`
			import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
			export default defineWorkersConfig({
				test: {
					poolOptions: {
						workers: {
							singleWorker: 42,
							isolatedStorage: "yes please",
							miniflare: [],
							wrangler: "./wrangler.toml"
						},
					},
				}
			});
		`,
			"index.test.ts": "",
		});
		let result = await vitestRun();
		expect(await result.exitCode).toBe(1);
		let expected = dedent`
		TypeError: Unexpected pool options in project ${path.join(tmpPathName, "vitest.config.mts")}:
		{
			test: {
				poolOptions: {
					workers: {
						singleWorker: 42,
													^ Expected boolean, received number
						isolatedStorage: 'yes please',
														 ^ Expected boolean, received string
						miniflare: [],
											 ^ Expected object, received array
						wrangler: './wrangler.toml',
											^ Expected object, received string
					},
				},
			},
		}
	`.replaceAll("\t", "  ");
		expect(result.stderr).toMatch(expected);

		// Check `miniflare` options validated with correct error paths
		await seed({
			"vitest.config.mts": dedent`
			import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
			export default defineWorkersConfig({
				test: {
					poolOptions: {
						workers: {
							miniflare: {
								compatibilityDate: { year: 2024, month: 1, day: 1 }
							},
						},
					},
				}
			});
		`,
			"index.test.ts": "",
		});
		result = await vitestRun();
		expect(await result.exitCode).toBe(1);
		expected = dedent`
		TypeError: Unexpected pool options in project ${path.join(tmpPathName, "vitest.config.mts")}:
		{
			test: {
				poolOptions: {
					workers: {
						miniflare: {
							compatibilityDate: { year: 2024, month: 1, day: 1 },
																 ^ Expected string, received object
						},
					},
				},
			},
		}
	`.replaceAll("\t", "  ");
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
			"vitest.config.mts": dedent`
			import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
			export default defineWorkersConfig({
				test: {
					poolOptions: {
						workers: {
							singleWorker: true,
							miniflare: {
								compatibilityDate: "2024-01-01",
								compatibilityFlags: ["nodejs_compat"],
							},
						},
					},
				}
			});
		`,
			"index.test.ts": dedent`
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
			"vitest.config.mts": dedent`
			import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
			export default defineWorkersConfig({
				test: {
					poolOptions: {
						workers: {
							main: "./index.ts",
							singleWorker: true,
							miniflare: {
								compatibilityDate: "2024-01-01",
								compatibilityFlags: ["nodejs_compat"],
							},
						},
					},
				}
			});
		`,
			"index.ts": dedent`
			addEventListener("fetch", (event) => {
				event.respondWith(new Response("body"));
			});
		`,
		});
		result = await vitestRun();
		expect(await result.exitCode).toBe(1);
		expected = dedent`
		${path.join(tmpPathName, "index.ts")} does not export a default entrypoint. \`@cloudflare/vitest-pool-workers\` does not support service workers or named entrypoints for \`SELF\`.
		If you're using service workers, please migrate to the modules format: https://developers.cloudflare.com/workers/reference/migrate-to-module-workers.
	`;
		expect(result.stderr).toMatch(expected);
	}
);
