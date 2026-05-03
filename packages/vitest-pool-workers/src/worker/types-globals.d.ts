// noinspection ES6ConvertVarToLetConst

import type { VitestUtils, WorkerGlobalState } from "vitest";

declare global {
	// https://github.com/vitest-dev/vitest/blob/v4.0.18/packages/vitest/src/runtime/utils.ts#L24
	const __vitest_worker__: WorkerGlobalState;
	// https://github.com/vitest-dev/vitest/blob/v4.0.18/packages/vitest/src/runtime/moduleRunner/moduleRunner.ts#L86
	const __vitest_mocker__: VitestUtils & {
		moduleRunner: {
			import: (id: string) => Promise<Record<string, unknown>>;
		};
	};
	// Original, un-patched console that always logs directly to stdout/err,
	// without call site annotations
	var __console: typeof console;
}

export {};
