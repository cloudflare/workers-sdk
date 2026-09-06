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
