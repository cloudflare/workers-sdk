import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "ava";
import { globsToRegExps, testRegExps } from "miniflare";

test("globsToRegExps/testRegExps: matches glob patterns", (t) => {
	const globs = ["**/*.txt", "src/**/*.js", "!src/bad.js", "thing/*/*.jpg"];
	const matcherRegExps = globsToRegExps(globs);

	// Check `*.txt`
	t.true(testRegExps(matcherRegExps, "test.txt"));
	t.true(testRegExps(matcherRegExps, "dist/test.txt"));

	// Check `src/**/*.js`
	t.true(testRegExps(matcherRegExps, "src/index.js"));
	t.true(testRegExps(matcherRegExps, "src/lib/add.js"));
	t.false(testRegExps(matcherRegExps, "src/image.jpg"));

	// Check `!src/bad.js`
	t.false(testRegExps(matcherRegExps, "src/bad.js"));

	// Check `thing/*/*.txt`
	t.true(testRegExps(matcherRegExps, "thing/thing2/thing3.jpg"));
	t.false(testRegExps(matcherRegExps, "thing/thing2.jpg"));

	// Check absolute paths (`ModuleLinker` will `path.resolve` to absolute paths)
	// (see https://github.com/cloudflare/miniflare/issues/244)
	t.true(testRegExps(matcherRegExps, "/one/two/three.txt"));
	t.true(
		testRegExps(
			matcherRegExps,
			pathToFileURL(path.join(process.cwd(), "src/index.js")).href
		)
	);
});
