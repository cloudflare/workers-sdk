import assert from "node:assert";
import type Protocol from "devtools-protocol";

let sourceMappingPrepareStackTrace: typeof Error.prepareStackTrace;

export function getSourceMappedStack(
	details: Protocol.Runtime.ExceptionDetails
): string {
	const description = details.exception?.description ?? "";
	const callFrames = details.stackTrace?.callFrames;
	// If this exception didn't come with `callFrames`, we can't do any source
	// mapping without parsing the stack, so just return the description as is
	if (callFrames === undefined) return description;

	if (sourceMappingPrepareStackTrace === undefined) {
		// `source-map-support` will only modify `Error.prepareStackTrace` if this
		// is the first time `install()` has been called. This is governed by a
		// module level variable: `errorFormatterInstalled`. To ensure we're not
		// affecting external user's use of this package, and so
		// `Error.prepareStackTrace` is always updated, load a fresh copy, by
		// resetting then restoring the `require` cache.
		const originalSupport = require.cache["source-map-support"];
		delete require.cache["source-map-support"];
		// eslint-disable-next-line @typescript-eslint/consistent-type-imports,@typescript-eslint/no-var-requires
		const support: typeof import("source-map-support") = require("source-map-support");
		require.cache["source-map-support"] = originalSupport;

		const originalPrepareStackTrace = Error.prepareStackTrace;
		support.install({
			environment: "node",
			// Don't add Node `uncaughtException` handler
			handleUncaughtExceptions: false,
			// Don't hook Node `require` function
			hookRequire: false,
			// Make sure we're using fresh copies of files each time we source map
			emptyCacheBetweenOperations: true,
		});
		sourceMappingPrepareStackTrace = Error.prepareStackTrace;
		assert(sourceMappingPrepareStackTrace !== undefined);
		Error.prepareStackTrace = originalPrepareStackTrace;
	}

	const nameMessage = details.exception?.description?.split("\n")[0] ?? "";
	const colonIndex = nameMessage.indexOf(":");
	const error = new Error(nameMessage.substring(colonIndex + 2));
	error.name = nameMessage.substring(0, colonIndex);
	const callSites = callFrames.map((frame) => new CallSite(frame));
	return sourceMappingPrepareStackTrace(error, callSites);
}

export class CallSite implements NodeJS.CallSite {
	constructor(private readonly frame: Protocol.Runtime.CallFrame) {}

	getThis(): unknown {
		return null;
	}
	getTypeName(): string | null {
		return null;
	}
	// eslint-disable-next-line @typescript-eslint/ban-types
	getFunction(): Function | undefined {
		return undefined;
	}
	getFunctionName(): string | null {
		return this.frame.functionName;
	}
	getMethodName(): string | null {
		return null;
	}
	getFileName(): string | undefined {
		return this.frame.url;
	}
	getScriptNameOrSourceURL(): string | null {
		return this.frame.url;
	}
	getLineNumber(): number | null {
		return this.frame.lineNumber;
	}
	getColumnNumber(): number | null {
		return this.frame.columnNumber;
	}
	getEvalOrigin(): string | undefined {
		return undefined;
	}
	isToplevel(): boolean {
		return false;
	}
	isEval(): boolean {
		return false;
	}
	isNative(): boolean {
		return false;
	}
	isConstructor(): boolean {
		return false;
	}
	isAsync(): boolean {
		return false;
	}
	isPromiseAll(): boolean {
		return false;
	}
	isPromiseAny(): boolean {
		return false;
	}
	getPromiseIndex(): number | null {
		return null;
	}
}
