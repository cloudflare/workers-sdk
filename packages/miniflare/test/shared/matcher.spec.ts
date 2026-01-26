import path from "node:path";
import { pathToFileURL } from "node:url";
import { globsToRegExps, testRegExps } from "miniflare";
import { expect, test } from "vitest";

test("globsToRegExps/testRegExps: matches glob patterns", () => {
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
