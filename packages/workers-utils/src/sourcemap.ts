import assert from "node:assert";
import { createRequire } from "node:module";
import type * as sourceMapSupport from "@cspotcode/source-map-support";

/**
 * Loads an isolated source-map-support instance so tools can install different
 * stack-trace handlers without sharing options or affecting the user's instance.
 * The require cache and global symbol lookup are restored after loading.
 */
export function getFreshSourceMapSupport(): typeof sourceMapSupport {
	// createRequire supplies a real CJS cache under ESM and Yarn PnP. The
	// filename fallback also supports consumers that bundle this helper as CJS.
	// eslint-disable-next-line no-restricted-globals -- Resolve dependencies relative to the CJS bundle, not a project base path.
	const realRequire = createRequire(import.meta.url || __filename);
	const resolvedSupportPath = realRequire.resolve(
		"@cspotcode/source-map-support"
	);

	const originalSymbolFor = Symbol.for;
	const originalSupport = realRequire.cache[resolvedSupportPath];
	try {
		Symbol.for = (key) => {
			// Make sure we only override the expected symbol. If we upgrade this
			// package, and new symbols are used, this assertion will fail in tests.
			// We want to guard against `source-map-support/sharedData` changing to
			// something else. If this new symbol *should* be shared across package
			// instances, we'll need to add an
			// `if (key === "...") return originalSymbolFor(key);` here.
			assert.strictEqual(key, "source-map-support/sharedData");
			return Symbol(key);
		};
		delete realRequire.cache[resolvedSupportPath];
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- require needed to bypass module cache for fresh copy
		return realRequire(resolvedSupportPath);
	} finally {
		Symbol.for = originalSymbolFor;
		realRequire.cache[resolvedSupportPath] = originalSupport;
	}
}
