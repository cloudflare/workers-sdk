import assert from "node:assert";

// See public facing `cloudflare:test` types for docs
export let env: Record<string, unknown>;
export let internalEnv: Env;
export function setEnv(newEnv: Env) {
	// Store full env for `WorkersSnapshotEnvironment`
	internalEnv = newEnv;

	// Strip internal bindings from user facing `env`
	env = { ...newEnv };
	delete env.__VITEST_POOL_WORKERS_LOOPBACK_SERVICE;
	delete env.__VITEST_POOL_WORKERS_RUNNER_OBJECT;
	delete env.__VITEST_POOL_WORKERS_UNSAFE_EVAL;
}

export function getSerializedOptions(): SerializedOptions {
	assert(typeof __vitest_worker__ === "object", "Expected global Vitest state");
	const options = __vitest_worker__.config?.poolOptions?.workers;
	// `options` should always be defined when running tests
	assert(options !== undefined, "Expected serialised options");
	return options;
}
