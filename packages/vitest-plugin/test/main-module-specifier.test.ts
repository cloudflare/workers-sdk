import dedent from "ts-dedent";
import { test } from "./helpers";

// Regression tests for https://github.com/cloudflare/workers-sdk/issues/14937
//
// `@cloudflare/vite-plugin` supports packages and virtual modules in the
// Worker config's `main` field, so frameworks such as TanStack Start document
// `"main": "@tanstack/react-start/server-entry"`. The Vitest integration reads
// the same Wrangler config, but treats `main` as a file path relative to the
// config, so the Worker under test cannot be imported and `SELF.fetch()` fails
// with "Cannot find module '<project>/<specifier>'".

const selfFetchTest = (expected: string) => dedent /* javascript */ `
	import { SELF } from "cloudflare:test";
	import { it } from "vitest";

	it("dispatches a request to the main Worker", async ({ expect }) => {
		const response = await SELF.fetch("http://example.com/");
		expect(await response.text()).toBe(${JSON.stringify(expected)});
	});
`;

test(
	"resolves a package entrypoint in the Wrangler config's `main` field",
	{ timeout: 60_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": dedent /* javascript */ `
				import { cloudflareTest } from "@cloudflare/vitest-plugin";

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
					"name": "main-package-entrypoint",
					"main": "worker-framework/server-entry",
					"compatibility_date": "2025-12-02",
					"compatibility_flags": ["nodejs_compat"]
				}
			`,
			"node_modules/worker-framework/package.json": JSON.stringify({
				name: "worker-framework",
				version: "1.0.0",
				type: "module",
				exports: { "./server-entry": "./dist/server-entry.js" },
			}),
			"node_modules/worker-framework/dist/server-entry.js": dedent /* javascript */ `
				export default {
					async fetch() {
						return new Response("hello from package entry");
					},
				};
			`,
			"index.test.ts": selfFetchTest("hello from package entry"),
		});

		const result = await vitestRun();
		expect(result.stderr).not.toContain("Cannot find module");
		expect(await result.exitCode).toBe(0);
	}
);

test(
	"resolves a virtual module entrypoint in the Wrangler config's `main` field",
	{ timeout: 60_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": dedent /* javascript */ `
				import { cloudflareTest } from "@cloudflare/vitest-plugin";

				// Stands in for a framework's Vite plugin providing its server entry
				function virtualWorkerEntry() {
					const id = "virtual:worker-entry";
					const resolvedId = "\\0" + id;
					return {
						name: "virtual-worker-entry",
						resolveId(source) {
							if (source === id) return resolvedId;
						},
						load(loadId) {
							if (loadId === resolvedId) {
								return 'export default { async fetch() { return new Response("hello from virtual entry"); } };';
							}
						},
					};
				}

				export default {
					plugins: [
						virtualWorkerEntry(),
						cloudflareTest({
							wrangler: { configPath: "./wrangler.jsonc" },
						}),
					],
					test: { testTimeout: 90_000 },
				};
			`,
			"wrangler.jsonc": dedent`
				{
					"name": "main-virtual-entrypoint",
					"main": "virtual:worker-entry",
					"compatibility_date": "2025-12-02",
					"compatibility_flags": ["nodejs_compat"]
				}
			`,
			"index.test.ts": selfFetchTest("hello from virtual entry"),
		});

		const result = await vitestRun();
		expect(result.stderr).not.toContain("Cannot find module");
		expect(await result.exitCode).toBe(0);
	}
);
