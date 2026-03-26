import path from "node:path";
import { pathToFileURL } from "node:url";
import { globsToRegExps, testRegExps } from "miniflare";
import { test } from "vitest";

test("globsToRegExps/testRegExps: matches glob patterns", ({ expect }) => {
	const globs = ["**/*.txt", "src/**/*.js", "!src/bad.js", "thing/*/*.jpg"];
	const matcherRegExps = globsToRegExps(globs);

	// Check `*.txt`
	expect(testRegExps(matcherRegExps, "test.txt")).toBe(true);
	expect(testRegExps(matcherRegExps, "dist/test.txt")).toBe(true);

	// Check `src/**/*.js`
	expect(testRegExps(matcherRegExps, "src/index.js")).toBe(true);
	expect(testRegExps(matcherRegExps, "src/lib/add.js")).toBe(true);
	expect(testRegExps(matcherRegExps, "src/image.jpg")).toBe(false);

	// Check `!src/bad.js`
	expect(testRegExps(matcherRegExps, "src/bad.js")).toBe(false);

	// Check `thing/*/*.txt`
	expect(testRegExps(matcherRegExps, "thing/thing2/thing3.jpg")).toBe(true);
	expect(testRegExps(matcherRegExps, "thing/thing2.jpg")).toBe(false);

	// Check absolute paths (`ModuleLinker` will `path.resolve` to absolute paths)
	// (see https://github.com/cloudflare/miniflare/issues/244)
	expect(testRegExps(matcherRegExps, "/one/two/three.txt")).toBe(true);
	expect(
		testRegExps(
			matcherRegExps,
			pathToFileURL(path.join(process.cwd(), "src/index.js")).href
		)
	).toBe(true);
});

test("globsToRegExps/testRegExps: does not match double-extension paths (e.g. foo.wasm.js for **/*.wasm)", ({
	expect,
}) => {
	// Regression test for https://github.com/cloudflare/workers-sdk/issues/8280
	// A pattern like **/*.wasm must NOT match foo.wasm.js — the extension must
	// be anchored to the end of the path.
	const wasmMatcher = globsToRegExps(["**/*.wasm"]);

	expect(testRegExps(wasmMatcher, "foo.wasm")).toBe(true);
	expect(testRegExps(wasmMatcher, "path/to/foo.wasm")).toBe(true);
	expect(testRegExps(wasmMatcher, "/absolute/path/to/foo.wasm")).toBe(true);

	// Must NOT match double-extension variants
	expect(testRegExps(wasmMatcher, "foo.wasm.js")).toBe(false);
	expect(testRegExps(wasmMatcher, "src/main.wasm.test.js")).toBe(false);
	expect(testRegExps(wasmMatcher, "foo.wasm.map")).toBe(false);
});
