import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

// A package's `browser` field can map a dependency to `false`, as postcss does
// with `{ "browser": { "source-map-js": false } }`. Vite resolves a `require()`
// of such a dependency to `__vite-browser-external`, which the module fallback
// service redirects to an empty stub module shipped in the published package.
test(
	"requires a dependency that a package's browser field maps to false",
	{ timeout: 45_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": vitestConfig(),
			"node_modules/browser-false-demo/package.json": JSON.stringify({
				name: "browser-false-demo",
				version: "1.0.0",
				main: "index.cjs",
				browser: { "stubbed-dep": false },
			}),
			"node_modules/browser-false-demo/index.cjs": dedent`
				const stubbed = require("stubbed-dep");
				module.exports = { answer: 42, stubbed };
			`,
			"node_modules/stubbed-dep/package.json": JSON.stringify({
				name: "stubbed-dep",
				version: "1.0.0",
				main: "index.cjs",
			}),
			"node_modules/stubbed-dep/index.cjs": dedent`
				module.exports = { notStubbed: true };
			`,
			"index.test.ts": dedent`
				import { expect, it } from "vitest";
				import demo from "browser-false-demo";

				it("loads a CJS module whose dependency is stubbed out", () => {
					expect(demo.answer).toBe(42);
					expect(demo.stubbed.notStubbed).toBeUndefined();
				});
			`,
		});

		const result = await vitestRun();
		const exitCode = await result.exitCode;
		expect(result.stderr).not.toContain("empty-internal.cjs");
		expect(exitCode).toBe(0);
	}
);
