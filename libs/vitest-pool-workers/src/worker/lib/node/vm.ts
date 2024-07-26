import assert from "node:assert";
import type { RunningScriptOptions } from "node:vm";

let unsafeEval: UnsafeEval | undefined;
export function _setUnsafeEval(newUnsafeEval: UnsafeEval) {
	unsafeEval = newUnsafeEval;
}

export function runInThisContext(code: string, options?: RunningScriptOptions) {
	assert(unsafeEval !== undefined);
	return unsafeEval.eval(code, options?.filename);
}

export default { runInThisContext };
