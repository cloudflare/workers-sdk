import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

test(
	"resolves relative requires from CJS modules when the project path contains spaces",
	{ timeout: 45_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": vitestConfig(),
			"node_modules/cjs-demo/package.json": JSON.stringify({
				name: "cjs-demo",
				version: "1.0.0",
				main: "index.cjs",
			}),
			"node_modules/cjs-demo/index.cjs": dedent`
				module.exports = require("./lib/impl.cjs");
			`,
			"node_modules/cjs-demo/lib/impl.cjs": dedent`
				module.exports = { answer: 42 };
			`,
			"index.test.ts": dedent`
				import { expect, it } from "vitest";
				import demo from "cjs-demo";

				it("loads an internal CJS module", () => {
					expect(demo.answer).toBe(42);
				});
			`,
		});

		const result = await vitestRun();
		expect(await result.exitCode).toBe(0);
	}
);

test(
	"resolves requires from CJS modules to the require export condition",
	{ timeout: 45_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": vitestConfig(),
			"node_modules/cjs-demo/package.json": JSON.stringify({
				name: "cjs-demo",
				version: "1.0.0",
				main: "index.cjs",
			}),
			"node_modules/cjs-demo/index.cjs": dedent`
				module.exports = require("dual-demo");
			`,
			"node_modules/dual-demo/package.json": JSON.stringify({
				name: "dual-demo",
				version: "1.0.0",
				exports: {
					".": {
						import: "./index.mjs",
						require: "./index.cjs",
					},
				},
			}),
			"node_modules/dual-demo/index.mjs": dedent`
				export const format = "esm";
			`,
			"node_modules/dual-demo/index.cjs": dedent`
				module.exports = { format: "cjs" };
			`,
			"index.test.ts": dedent`
				import { expect, it } from "vitest";
				import demo from "cjs-demo";

				it("loads the CJS entry of a dual-format package", () => {
					expect(demo.format).toBe("cjs");
				});
			`,
		});

		const result = await vitestRun();
		expect(await result.exitCode).toBe(0);
	}
);
