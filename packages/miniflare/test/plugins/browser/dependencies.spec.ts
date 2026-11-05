import assert from "node:assert";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "vitest";

/**
 * The `yauzl` used to extract the Chrome archive must not predate 3.3.1.
 *
 * `@puppeteer/browsers` extracts the Chrome-for-Testing download with
 * `extract-zip`, which unzips with `yauzl`. `yauzl` 2.x misuses
 * `stream.destroy()`, relying on undefined behaviour that Node.js 26 changed:
 * on Node 26 the inflate stream never emits `end` for larger deflate entries,
 * so the extraction of the Chrome archive never completes and the first local
 * Browser Rendering launch hangs forever (https://github.com/thejoshwolfe/yauzl/issues/176,
 * fixed in `yauzl` 3.3.1). `miniflare` bundles its dependencies into `dist`,
 * so the `yauzl` version resolved here is the one that ships.
 *
 * The hang itself only reproduces on Node.js 26, so this test pins the
 * dependency instead of the behaviour: it fails while `@puppeteer/browsers`
 * resolves to a broken `yauzl`, and passes once the dependency is bumped
 * (`@puppeteer/browsers` 3.x drops `extract-zip` entirely, and `yauzl` 3.x
 * fixes the hang).
 *
 * https://github.com/cloudflare/workers-sdk/issues/16522
 */
const MINIMUM_YAUZL_VERSION = "3.3.1";

/** Version of the package that `entryPath` belongs to, from its `package.json`. */
function packageVersionOf(entryPath: string): string {
	let dir = path.dirname(entryPath);
	for (;;) {
		const manifestPath = path.join(dir, "package.json");
		if (fs.existsSync(manifestPath)) {
			return JSON.parse(fs.readFileSync(manifestPath, "utf8")).version;
		}
		const parent = path.dirname(dir);
		assert.notStrictEqual(parent, dir, `No package.json above ${entryPath}`);
		dir = parent;
	}
}

/** Whether `version` is at least `minimum`, for plain `major.minor.patch` versions. */
function isVersionAtLeast(version: string, minimum: string): boolean {
	const parse = (s: string) => s.split(".").map((n) => Number.parseInt(n, 10));
	const [versionMajor, versionMinor, versionPatch] = parse(version);
	const [minimumMajor, minimumMinor, minimumPatch] = parse(minimum);
	return (
		versionMajor > minimumMajor ||
		(versionMajor === minimumMajor &&
			(versionMinor > minimumMinor ||
				(versionMinor === minimumMinor && versionPatch >= minimumPatch)))
	);
}

test("Chrome extraction does not depend on a yauzl that hangs on Node.js 26", () => {
	const requireFromHere = createRequire(import.meta.url);
	const browsersEntry = requireFromHere.resolve("@puppeteer/browsers");
	const requireFromBrowsers = createRequire(browsersEntry);

	// `@puppeteer/browsers` 3.x no longer extracts archives with `extract-zip`,
	// so the dependency having gone away is the fixed state too.
	let extractZipEntry: string;
	try {
		extractZipEntry = requireFromBrowsers.resolve("extract-zip");
	} catch {
		return;
	}

	const yauzlEntry = createRequire(extractZipEntry).resolve("yauzl");
	const yauzlVersion = packageVersionOf(yauzlEntry);

	assert.ok(
		isVersionAtLeast(yauzlVersion, MINIMUM_YAUZL_VERSION),
		`Chrome extraction resolves yauzl@${yauzlVersion}, but yauzl < ${MINIMUM_YAUZL_VERSION} ` +
			`misuses stream.destroy() and never finishes extracting larger deflate entries on ` +
			`Node.js 26, hanging the first local Browser Rendering launch ` +
			`(https://github.com/cloudflare/workers-sdk/issues/16522)`
	);
});
