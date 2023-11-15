import assert from "assert";
import type { Options } from "source-map-support";
import { parseStack } from "./callsite";

const sourceMapInstallBaseOptions: Options = {
	environment: "node",
	// Don't add Node `uncaughtException` handler
	handleUncaughtExceptions: false,
	// Don't hook Node `require` function
	hookRequire: false,

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

	// `source-map-support` will only modify `Error.prepareStackTrace` if this is
	// the first time `install()` has been called. This is governed by a module
	// level variable: `errorFormatterInstalled`. To ensure we're not affecting
	// external user's use of this package, and so `Error.prepareStackTrace` is
	// always updated, load a fresh copy, by resetting then restoring the
	// `require` cache.

	const originalSupport = require.cache["source-map-support"];
	delete require.cache["source-map-support"];
	const support: typeof import("source-map-support") = require("source-map-support");
	require.cache["source-map-support"] = originalSupport;

	const originalPrepareStackTrace = Error.prepareStackTrace;
	support.install(sourceMapInstallBaseOptions);
	const prepareStackTrace = Error.prepareStackTrace;
	assert(prepareStackTrace !== undefined);
	Error.prepareStackTrace = originalPrepareStackTrace;

	sourceMapper = (retrieveSourceMap, error) => {
		support.install({
			...sourceMapInstallBaseOptions,
			retrieveFile(file: string): string | null {
				// `retrieveFile` should only be called by the default implementation of
				// `retrieveSourceMap`, so we shouldn't need to implement it
				assert.fail(`Unexpected retrieveFile(${JSON.stringify(file)}) call`);
			},
			retrieveSourceMap,
		});

		// Parse the stack trace into structured call sites and source-map them
		const callSites = parseStack(error.stack ?? "");
		return prepareStackTrace(error, callSites);
	};
	return sourceMapper;
}
