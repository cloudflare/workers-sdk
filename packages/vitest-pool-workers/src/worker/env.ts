import assert from "node:assert";

// See public facing `cloudflare:test` types for docs
export let env: Record<string, unknown>;
export let SELF: Fetcher;

export function stripInternalEnv(
	internalEnv: Record<string, unknown> & Env
): Record<string, unknown> {
	const result: Record<string, unknown> & Partial<Env> = { ...internalEnv };
	delete result.__VITEST_POOL_WORKERS_SELF_NAME;
	delete result.__VITEST_POOL_WORKERS_SELF_SERVICE;
	delete result.__VITEST_POOL_WORKERS_LOOPBACK_SERVICE;
	delete result.__VITEST_POOL_WORKERS_RUNNER_OBJECT;
	delete result.__VITEST_POOL_WORKERS_UNSAFE_EVAL;
	return result;
}

export let internalEnv: Record<string, unknown> & Env;
export function setEnv(newEnv: Record<string, unknown> & Env) {
	// Store full env for `WorkersSnapshotEnvironment`
	internalEnv = newEnv;
	SELF = newEnv.__VITEST_POOL_WORKERS_SELF_SERVICE;

	// Strip internal bindings from user facing `env`
	env = stripInternalEnv(newEnv);
}

export function getSerializedOptions(): SerializedOptions {
	assert(typeof __vitest_worker__ === "object", "Expected global Vitest state");
	const options = __vitest_worker__.config?.poolOptions?.workers;
	// `options` should always be defined when running tests
	assert(options !== undefined, "Expected serialised options");
	return options;
}

export function getResolvedMainPath(
	forBindingType: "service" | "Durable Object"
): string {
	const options = getSerializedOptions();
	if (options.main === undefined) {
		throw new Error(
			`Using ${forBindingType} bindings to the current worker requires \`poolOptions.workers.main\` to be set to your worker's entrypoint`
		);
	}
	return options.main;
}
