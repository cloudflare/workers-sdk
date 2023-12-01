import assert from "node:assert";

export let env: Record<string, unknown>;
export function setEnv(newEnv: Record<string, unknown>) {
	env = newEnv;
}

export function getSerializedOptions(): SerializedOptions {
	assert(typeof __vitest_worker__ === "object", "Expected global Vitest state");
	const options = __vitest_worker__.config?.poolOptions?.miniflare;
	// `options` should always be defined when running tests
	assert(options !== undefined, "Expected serialised options");
	return options;
}
