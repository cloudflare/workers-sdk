// noinspection ES6ConvertVarToLetConst

import type { WorkerGlobalState } from "vitest";

declare global {
	// https://github.com/vitest-dev/vitest/blob/v1.0.0-beta.5/packages/vitest/src/runtime/worker.ts#L49-L69
	const __vitest_worker__: WorkerGlobalState & {
		config?: { poolOptions?: { workers?: SerializedOptions } };
	};
	// Original, un-patched console that always logs directly to stdout/err,
	// without call site annotations
	var __console: typeof console;
}

export {};
