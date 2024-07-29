declare global {
	// Defined by `esbuild` in `scripts/bundle.mjs` from `workerd` RTTI
	const VITEST_POOL_WORKERS_DEFINE_BUILTIN_MODULES: ReadonlyArray<string>;
}

export {};
