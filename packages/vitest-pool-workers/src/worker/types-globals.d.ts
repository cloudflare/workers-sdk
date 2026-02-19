// noinspection ES6ConvertVarToLetConst

import type { VitestUtils, WorkerGlobalState } from "vitest";

declare global {
	// https://github.com/vitest-dev/vitest/blob/1ec3a8b687c57153ed3d0d4777d7765c18f3cc82/packages/vitest/src/runtime/utils.ts#L24
	const __vitest_worker__: WorkerGlobalState;
	// https://github.com/vitest-dev/vitest/blob/1ec3a8b687c57153ed3d0d4777d7765c18f3cc82/packages/vitest/src/runtime/moduleRunner/moduleRunner.ts#L86
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
