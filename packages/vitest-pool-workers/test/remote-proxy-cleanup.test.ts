import dedent from "ts-dedent";
import { test } from "./helpers";

// This test requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN
// environment variables to be set, as it exercises remote proxy sessions
// that connect to the Cloudflare API.
test.skipIf(
	!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN
)(
	"disposes remote proxy sessions on pool close",
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": dedent`
				import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
				import { defineConfig } from "vitest/config";

				export default defineConfig(async () => {
					return {
						plugins: [
							cloudflareTest({
								wrangler: { configPath: "./wrangler.jsonc" },
							}),
						],
						test: {
							reporters: ["hanging-process", "verbose"],
							teardownTimeout: 5000,
						},
					};
				});

			`,
			"wrangler.jsonc": dedent`
				{
					"name": "test-worker",
					"main": "src/index.ts",
					"compatibility_date": "2025-06-01",
					"compatibility_flags": ["nodejs_compat"],
					"ai": { "binding": "AI" },
					"account_id": "${process.env.CLOUDFLARE_ACCOUNT_ID}"
				}
			`,
			"src/index.ts": dedent`
				export default {
					async fetch(request, env, ctx) {
						return new Response("Hello");
					}
				}
			`,
			"src/index.test.ts": dedent`
				import { SELF } from "cloudflare:test";
				import { it, expect } from "vitest";
				it("responds with Hello", async () => {
					const response = await SELF.fetch("http://localhost/");
					expect(await response.text()).toBe("Hello");
				});
			`,
		});

		const result = await vitestRun({
			flags: ["--reporter=hanging-process", "--reporter=verbose"],
		});

		expect(await result.exitCode).toBe(0);
		expect(result.stderr).not.toContain(
			"something prevents Vite server from exiting"
		);
	},
	20_000
);
