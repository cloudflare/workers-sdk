import assert from "node:assert";

export function existsSync(_path: string) {
	return false;
}

export function readdirSync(_path: string) {
	assert.fail("readdirSync() is not yet implemented in worker");
}

export function readFileSync(_path: string) {
	assert.fail("readFileSync() is not yet implemented in worker");
}

export function statSync(_path: string) {
	assert.fail("statSync() is not yet implemented in worker");
}

export const promises = {};

export default {};
