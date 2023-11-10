import assert from "node:assert";
import type Protocol from "devtools-protocol";

let sourceMappingPrepareStackTrace: typeof Error.prepareStackTrace;
function getSourceMappingPrepareStackTrace(): NonNullable<
	typeof Error.prepareStackTrace
> {
	if (sourceMappingPrepareStackTrace !== undefined) {
		return sourceMappingPrepareStackTrace;
	}

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

	return sourceMappingPrepareStackTrace;
}

export function getSourceMappedStack(
	details: Protocol.Runtime.ExceptionDetails
): string {
	const description = details.exception?.description ?? "";
	const callFrames = details.stackTrace?.callFrames;
	// If this exception didn't come with `callFrames`, we can't do any source
	// mapping without parsing the stack, so just return the description as is
	if (callFrames === undefined) return description;

	const nameMessage = details.exception?.description?.split("\n")[0] ?? "";
	const colonIndex = nameMessage.indexOf(":");
	const error = new Error(nameMessage.substring(colonIndex + 2));
	error.name = nameMessage.substring(0, colonIndex);
	const callSites = callFrames.map(callFrameToCallSite);
	return getSourceMappingPrepareStackTrace()(error, callSites);
}

function callFrameToCallSite(frame: Protocol.Runtime.CallFrame): CallSite {
	return new CallSite({
		typeName: null,
		functionName: frame.functionName,
		methodName: null,
		fileName: frame.url,
		lineNumber: frame.lineNumber + 1,
		columnNumber: frame.columnNumber + 1,
		native: false,
	});
}

const placeholderError = new Error();
export function getSourceMappedString(value: string): string {
	// We could use `.replace()` here with a function replacer, but
	// `getSourceMappingPrepareStackTrace()` clears its source map caches between
	// operations. It's likely call sites in this `value` will share source maps,
	// so instead we find all call sites, source map them together, then replace.
	// Note this still works if there are multiple instances of the same call site
	// (e.g. stack overflow error), as the final `.replace()`s will only replace
	// the first instance. If they replace the value with itself, all instances
	// of the call site would've been replaced with the same thing.
	const callSiteLines = Array.from(value.matchAll(CALL_SITE_REGEXP));
	const callSites = callSiteLines.map(lineMatchToCallSite);
	const sourceMappedStackTrace: string = getSourceMappingPrepareStackTrace()(
		placeholderError,
		callSites
	);
	const sourceMappedCallSiteLines = sourceMappedStackTrace.split("\n").slice(1);
	for (let i = 0; i < callSiteLines.length; i++) {
		value = value.replace(
			callSiteLines[i][0],
			sourceMappedCallSiteLines[i].substring(4) // Trim indent from stack
		);
	}
	return value;
}

// Adapted from `node-stack-trace`:
/*!
 * Copyright (c) 2011 Felix Geisendörfer (felix@debuggable.com)
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the "Software"), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

const CALL_SITE_REGEXP =
	/at (?:(.+?)\s+\()?(?:(.+?):(\d+)(?::(\d+))?|([^)]+))\)?/g;
function lineMatchToCallSite(lineMatch: RegExpMatchArray): CallSite {
	let object: string | null = null;
	let method: string | null = null;
	let functionName: string | null = null;
	let typeName: string | null = null;
	let methodName: string | null = null;
	const isNative = lineMatch[5] === "native";

	if (lineMatch[1]) {
		functionName = lineMatch[1];
		let methodStart = functionName.lastIndexOf(".");
		if (functionName[methodStart - 1] == ".") methodStart--;
		if (methodStart > 0) {
			object = functionName.substring(0, methodStart);
			method = functionName.substring(methodStart + 1);
			const objectEnd = object.indexOf(".Module");
			if (objectEnd > 0) {
				functionName = functionName.substring(objectEnd + 1);
				object = object.substring(0, objectEnd);
			}
		}
	}

	if (method) {
		typeName = object;
		methodName = method;
	}

	if (method === "<anonymous>") {
		methodName = null;
		functionName = null;
	}

	return new CallSite({
		typeName,
		functionName,
		methodName,
		fileName: lineMatch[2] || null,
		lineNumber: parseInt(lineMatch[3]) || null,
		columnNumber: parseInt(lineMatch[4]) || null,
		native: isNative,
	});
}

export interface CallSiteOptions {
	typeName: string | null;
	functionName: string | null;
	methodName: string | null;
	fileName: string | null;
	lineNumber: number | null;
	columnNumber: number | null;
	native: boolean;
}

// https://v8.dev/docs/stack-trace-api#customizing-stack-traces
// This class supports the subset of options implemented by `node-stack-trace`:
// https://github.com/felixge/node-stack-trace/blob/4c41a4526e74470179b3b6dd5d75191ca8c56c17/index.js
export class CallSite implements NodeJS.CallSite {
	constructor(private readonly opts: CallSiteOptions) {}

	getThis(): unknown {
		return null;
	}
	getTypeName(): string | null {
		return this.opts.typeName;
	}
	// eslint-disable-next-line @typescript-eslint/ban-types
	getFunction(): Function | undefined {
		return undefined;
	}
	getFunctionName(): string | null {
		return this.opts.functionName;
	}
	getMethodName(): string | null {
		return this.opts.methodName;
	}
	getFileName(): string | undefined {
		return this.opts.fileName ?? undefined;
	}
	getScriptNameOrSourceURL(): string | null {
		return this.opts.fileName;
	}
	getLineNumber(): number | null {
		return this.opts.lineNumber;
	}
	getColumnNumber(): number | null {
		return this.opts.columnNumber;
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
		return this.opts.native;
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
