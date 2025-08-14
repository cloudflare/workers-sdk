// Lifted from `node-stack-trace`:
// https://github.com/felixge/node-stack-trace/blob/4c41a4526e74470179b3b6dd5d75191ca8c56c17/index.js
// Ideally, we'd just use this package as-is, but it has a strict
// `engines.node == 16` constraint in its `package.json`. There's a PR open to
// fix this (https://github.com/felixge/node-stack-trace/pull/39), but it's been
// open for a while. As soon as it's merged, we should just depend on it.

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

export function parseStack(stack: string): CallSite[] {
	return stack
		.split("\n")
		.slice(1)
		.map(parseCallSite)
		.filter((site): site is CallSite => site !== undefined);
}

function parseCallSite(line: string): CallSite | undefined {
	const lineMatch = line.match(
		/at (?:(.+?)\s+\()?(?:(.+?):(\d+)(?::(\d+))?|([^)]+))\)?/
	);
	if (!lineMatch) {
		return;
	}

	let object = null;
	let method = null;
	let functionName = null;
	let typeName = null;
	let methodName = null;
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
		fileName: lineMatch[2],
		lineNumber: parseInt(lineMatch[3]) || null,
		columnNumber: parseInt(lineMatch[4]) || null,
		native: isNative,
	});
}

export interface CallSiteOptions {
	typeName: string | null;
	functionName: string | null;
	methodName: string | null;
	fileName: string;
	lineNumber: number | null;
	columnNumber: number | null;
	native: boolean;
}

// https://v8.dev/docs/stack-trace-api#customizing-stack-traces
// This class supports the subset of options implemented by `node-stack-trace`:
// https://github.com/felixge/node-stack-trace/blob/4c41a4526e74470179b3b6dd5d75191ca8c56c17/index.js
export class CallSite implements NodeJS.CallSite {
	constructor(private readonly opts: CallSiteOptions) {}
	getScriptHash(): string {
		throw new Error("Method not implemented.");
	}
	getEnclosingColumnNumber(): number {
		throw new Error("Method not implemented.");
	}
	getEnclosingLineNumber(): number {
		throw new Error("Method not implemented.");
	}
	getPosition(): number {
		throw new Error("Method not implemented.");
	}

	getThis(): unknown {
		return null;
	}
	getTypeName(): string | null {
		return this.opts.typeName;
	}
	// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
	getFunction(): Function | undefined {
		return undefined;
	}
	getFunctionName(): string | null {
		return this.opts.functionName;
	}
	getMethodName(): string | null {
		return this.opts.methodName;
	}
	getFileName(): string | null {
		return this.opts.fileName ?? null;
	}
	getScriptNameOrSourceURL(): string {
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
