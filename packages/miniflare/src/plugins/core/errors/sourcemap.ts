import assert from "node:assert";
import { parseStack } from "./callsite";
import type { Options } from "@cspotcode/source-map-support";

// `source-map-support` will only modify `Error.prepareStackTrace` if this is
// the first time `install()` has been called. This is governed by shared data
// stored using a well-known symbol on `globalThis`. To ensure...
//
// a) `miniflare` and `wrangler` can have differing `install()` options
// b) We're not affecting external user's use of this package
// c) `Error.prepareStackTrace` is always updated on `install()`
//
// ...load a fresh copy, by resetting then restoring the `require` cache, and
// overriding `Symbol.for()` to return a unique symbol.
export function getFreshSourceMapSupport(): typeof import("@cspotcode/source-map-support") {
	const resolvedSupportPath = require.resolve("@cspotcode/source-map-support");

	const originalSymbolFor = Symbol.for;
	const originalSupport = require.cache[resolvedSupportPath];
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
		delete require.cache[resolvedSupportPath];
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		return require(resolvedSupportPath);
	} finally {
		Symbol.for = originalSymbolFor;
		require.cache[resolvedSupportPath] = originalSupport;
	}
}

const sourceMapInstallBaseOptions: Options = {
	environment: "node",
	// Don't add Node `uncaughtException` handler
	handleUncaughtExceptions: false,
	// Don't hook Node `require` function
	hookRequire: false,
	redirectConflictingLibrary: false,

	// Make sure we're using fresh copies of files (i.e. between `setOptions()`)
	emptyCacheBetweenOperations: true,

	// Always remove existing retrievers when calling `install()`, we should be
	// specifying them each time we want to source map
	overrideRetrieveFile: true,
	overrideRetrieveSourceMap: true,
};

// Returns the source-mapped stack trace for the specified error, using the
// specified function for retrieving source-maps.
export type SourceMapper = (
	retrieveSourceMap: Options["retrieveSourceMap"],
	error: Error
) => string;

let sourceMapper: SourceMapper;
export function getSourceMapper(): SourceMapper {
	if (sourceMapper !== undefined) return sourceMapper;

	const support = getFreshSourceMapSupport();
	const originalPrepareStackTrace = Error.prepareStackTrace;
	support.install(sourceMapInstallBaseOptions);
	const prepareStackTrace = Error.prepareStackTrace;
	assert(prepareStackTrace !== undefined);
	Error.prepareStackTrace = originalPrepareStackTrace;

	sourceMapper = (retrieveSourceMap, error) => {
		support.install({
			...sourceMapInstallBaseOptions,
			retrieveFile(_file: string): string {
				// `retrieveFile` should only be called by the default implementation of
				// `retrieveSourceMap`, which will only be called if `retrieveSourceMap`
				// failed. In that case, return an empty string so the default
				// implementation fails too (can't find `// sourceMappingURL` comment
				// in empty string).
				return "";
			},
			retrieveSourceMap,
		});

		// Parse the stack trace into structured call sites and source-map them
		const callSites = parseStack(error.stack ?? "");
		return prepareStackTrace(error, callSites);
	};
	return sourceMapper;
}
