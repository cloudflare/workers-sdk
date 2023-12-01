interface Env {
	__VITEST_POOL_WORKERS_RUNNER_OBJECT: DurableObjectNamespace;
	__VITEST_POOL_WORKERS_UNSAFE_EVAL: unknown;
}

interface SerializedOptions {
	// Defined in `src/pool/index.ts`
	main?: string;
	isolateDurableObjectBindings?: string[];
}

declare module "__VITEST_POOL_WORKERS_USER_OBJECT" {}
