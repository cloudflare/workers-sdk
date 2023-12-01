declare global {
	// https://github.com/vitest-dev/vitest/blob/v1.0.0-beta.5/packages/vitest/src/runtime/worker.ts#L49-L69
	const __vitest_worker__: {
		config?: { poolOptions?: { miniflare?: SerializedOptions } };
	};
}

export {};
