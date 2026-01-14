import dedent from "ts-dedent";
import { minimalVitestConfig, test } from "./helpers";

test(
	"supports CommonJS require() of JSON files",
	{ timeout: 45_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": minimalVitestConfig,
			"index.test.ts": dedent`
			import myDep from "my-json-dep";
			import { it, expect } from "vitest";

			it("loads JSON via require()", () => {
				expect(myDep.foo).toBe("bar");
				expect(myDep.polluted).toBeUndefined();
			});
		`,
			"node_modules/my-json-dep/package.json": dedent`
			{
				"name": "my-json-dep",
				"version": "0.0.0",
				"main": "./index.cjs"
			}
		`,
			"node_modules/my-json-dep/index.cjs": dedent`
			module.exports = require("./data.json");
		`,
			"node_modules/my-json-dep/data.json": dedent`
			{
				"foo": "bar",
				"__proto__": { "polluted": true }
			}
		`,
		});

		const result = await vitestRun();
		expect(await result.exitCode).toBe(0);
	}
);
