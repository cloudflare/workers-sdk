import assert from "node:assert";

type UnsafeEval = { eval(code: string): unknown };

let unsafeEval: UnsafeEval | undefined;
export function _setUnsafeEval(newUnsafeEval: UnsafeEval) {
	unsafeEval = newUnsafeEval;
}

export function runInThisContext(code: string) {
	assert(unsafeEval !== undefined);
	return unsafeEval.eval(code);
}

export default { runInThisContext };
