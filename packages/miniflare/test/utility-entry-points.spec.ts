import { execFileSync } from "node:child_process";
import path from "node:path";
import { test } from "vitest";

test("utility entry points work without loading Miniflare or workerd", ({
	expect,
}) => {
	const output = execFileSync(
		process.execPath,
		[
			"--input-type=commonjs",
			"-e",
			`
		const assert = require("node:assert/strict");
		const { registerHooks } = require("node:module");
		registerHooks({
			resolve(specifier, context, nextResolve) {
				if (specifier === "miniflare" || specifier === "workerd" || specifier.startsWith("workerd/")) {
					throw new Error("Unexpected runtime import: " + specifier);
				}
				return nextResolve(specifier, context);
			},
		});
		(async () => {
			for (const load of [async (name) => require(name), (name) => import(name)]) {
				const { getNodeCompat } = await load("miniflare/node-compat");
				assert.equal(getNodeCompat("2026-08-04", []).mode, "v2");
				const { getFreshSourceMapSupport } = await load("miniflare/sourcemap");
				const originalPrepareStackTrace = Error.prepareStackTrace;
				const originalSymbolFor = Symbol.for;
				const first = getFreshSourceMapSupport();
				const second = getFreshSourceMapSupport();
				assert.equal(typeof first.install, "function");
				assert.notEqual(first, second);
				assert.equal(Error.prepareStackTrace, originalPrepareStackTrace);
				assert.equal(Symbol.for, originalSymbolFor);
			}
			assert.equal(require("miniflare/package.json").name, "miniflare");
			assert.equal(require.resolve("miniflare/dist/src/index.js"), require.resolve("./dist/src/index.js"));
			console.log("ok");
		})().catch((error) => { console.error(error); process.exitCode = 1; });
	`,
		],
		{
			cwd: path.resolve(import.meta.dirname, ".."),
			encoding: "utf8",
		}
	);
	expect(output.trim()).toBe("ok");
});
