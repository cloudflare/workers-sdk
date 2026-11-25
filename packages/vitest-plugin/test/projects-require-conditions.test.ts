import dedent from "ts-dedent";
import { test } from "./helpers";

// With `cloudflareTest()` registered inside a `test.projects` entry, the root
// Vite config doesn't have the plugin's resolve conditions. A `require()` from
// a CJS dependency should still resolve with the project's conditions, as it
// does when the plugin is registered in the root `plugins`.
test(
	"resolves requires from CJS modules with the project's resolve conditions",
	{ timeout: 45_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": dedent`
				import { cloudflareTest } from "@cloudflare/vitest-plugin";

				export default {
					test: {
						projects: [
							{
								plugins: [
									cloudflareTest({
										miniflare: {
											compatibilityDate: "2025-12-02",
											compatibilityFlags: ["nodejs_compat"],
										},
									}),
								],
								test: { name: "worker" },
							},
						],
					},
				};
			`,
			"node_modules/cjs-demo/package.json": JSON.stringify({
				name: "cjs-demo",
				version: "1.0.0",
				main: "index.cjs",
			}),
			"node_modules/cjs-demo/index.cjs": dedent`
				module.exports = require("conditional-demo");
			`,
			"node_modules/conditional-demo/package.json": JSON.stringify({
				name: "conditional-demo",
				version: "1.0.0",
				exports: {
					".": {
						workerd: "./workerd.cjs",
						node: "./node.cjs",
						default: "./default.cjs",
					},
				},
			}),
			"node_modules/conditional-demo/workerd.cjs": dedent`
				module.exports = { build: "workerd" };
			`,
			"node_modules/conditional-demo/node.cjs": dedent`
				module.exports = { build: "node" };
			`,
			"node_modules/conditional-demo/default.cjs": dedent`
				module.exports = { build: "default" };
			`,
			"index.test.ts": dedent`
				import { expect, it } from "vitest";
				import demo from "cjs-demo";

				it("loads the workerd build of a required dependency", () => {
					expect(demo.build).toBe("workerd");
				});
			`,
		});

		const result = await vitestRun();
		expect(await result.exitCode, result.stderr + result.stdout).toBe(0);
	}
);
