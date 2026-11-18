import fs from "node:fs/promises";
import path from "node:path";
import dedent from "ts-dedent";
import { test } from "./helpers";

test(
	"supports resolve.preserveSymlinks with isolated node_modules",
	{ timeout: 45_000 },
	async ({ expect, seed, tmpPath, vitestRun }) => {
		await seed({
			"vitest.config.mts": dedent`
				import { cloudflareTest } from "@cloudflare/vitest-plugin";

				export default {
					plugins: [
						cloudflareTest({
							miniflare: { compatibilityDate: "2025-12-02" },
						}),
					],
					resolve: { preserveSymlinks: true },
				};
			`,
			"node_modules/cjs-demo/package.json": JSON.stringify({
				name: "cjs-demo",
				main: "index.cjs",
			}),
			"node_modules/cjs-demo/index.cjs": dedent`
				module.exports = require("dual-demo");
			`,
			"node_modules/.store/dual-demo/node_modules/dual-demo/package.json":
				JSON.stringify({
					name: "dual-demo",
					exports: { import: "./index.mjs", require: "./index.cjs" },
				}),
			"node_modules/.store/dual-demo/node_modules/dual-demo/index.mjs": dedent`
				export { format } from "dual-demo-esm-dep";
			`,
			"node_modules/.store/dual-demo/node_modules/dual-demo-esm-dep/package.json":
				JSON.stringify({
					name: "dual-demo-esm-dep",
					type: "module",
					exports: "./index.js",
				}),
			"node_modules/.store/dual-demo/node_modules/dual-demo-esm-dep/index.js": dedent`
				export const format = "esm";
			`,
			"node_modules/.store/dual-demo/node_modules/dual-demo/index.cjs": dedent`
				module.exports = require("dual-demo-dep");
			`,
			"node_modules/.store/dual-demo/node_modules/dual-demo-dep/package.json":
				JSON.stringify({ name: "dual-demo-dep", main: "index.cjs" }),
			"node_modules/.store/dual-demo/node_modules/dual-demo-dep/index.cjs": dedent`
				module.exports = { format: "cjs" };
			`,
			"real/helper.ts": dedent`
				export const url = import.meta.url;
			`,
			"index.test.ts": dedent`
				import { expect, it } from "vitest";
				import demo from "cjs-demo";
				import { format } from "dual-demo";
				import { url } from "./linked/helper";

				it("keeps the symlinked path of project files", () => {
					expect(url).toContain("/linked/helper.ts");
				});

				it("resolves package dependencies from their real paths", () => {
					expect(format).toBe("esm");
					expect(demo.format).toBe("cjs");
				});
			`,
		});
		await fs.symlink(
			path.join(tmpPath, "real"),
			path.join(tmpPath, "linked"),
			"junction"
		);
		await fs.symlink(
			path.join(
				tmpPath,
				"node_modules/.store/dual-demo/node_modules/dual-demo"
			),
			path.join(tmpPath, "node_modules/dual-demo"),
			"junction"
		);

		const result = await vitestRun();
		expect(await result.exitCode).toBe(0);
	}
);
