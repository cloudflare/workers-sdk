import { execFileSync } from "node:child_process";
import path from "node:path";
import { it } from "vitest";

it("uses the built helper entry points without loading Miniflare or workerd", ({
	expect,
}) => {
	const script = `
		import assert from "node:assert/strict";
		import { createRequire, registerHooks } from "node:module";
		registerHooks({
			resolve(specifier, context, nextResolve) {
				if (specifier === "miniflare" || specifier.startsWith("miniflare/") || specifier === "workerd" || specifier.startsWith("workerd/")) {
					throw new Error("Unexpected runtime import: " + specifier);
				}
				return nextResolve(specifier, context);
			},
		});
		const { getNodeCompat } = await import("@cloudflare/workers-utils/node-compat");
		assert.equal(getNodeCompat("2026-08-04", []).mode, "v2");
		const { getFreshSourceMapSupport } = await import("@cloudflare/workers-utils/sourcemap");
		const require = createRequire(import.meta.url);
		const resolved = require.resolve("@cspotcode/source-map-support");
		const original = require(resolved);
		const originalModule = require.cache[resolved];
		const originalPrepareStackTrace = Error.prepareStackTrace;
		const originalSymbolFor = Symbol.for;
		const first = getFreshSourceMapSupport();
		const second = getFreshSourceMapSupport();
		assert.notEqual(first, original);
		assert.notEqual(first, second);
		assert.equal(require.cache[resolved], originalModule);
		assert.equal(require(resolved), original);
		assert.equal(Error.prepareStackTrace, originalPrepareStackTrace);
		assert.equal(Symbol.for, originalSymbolFor);
		const options = { handleUncaughtExceptions: false, hookRequire: false, redirectConflictingLibrary: false };
		first.install(options);
		const firstPrepareStackTrace = Error.prepareStackTrace;
		second.install(options);
		assert.notEqual(Error.prepareStackTrace, firstPrepareStackTrace);
		Error.prepareStackTrace = originalPrepareStackTrace;
		console.log("ok");
	`;
	const output = execFileSync(
		process.execPath,
		["--input-type=module", "--eval", script],
		{
			cwd: path.resolve(import.meta.dirname, ".."),
			encoding: "utf8",
			timeout: 10_000,
		}
	);
	expect(output.trim()).toBe("ok");
});
