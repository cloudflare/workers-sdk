import assert from "node:assert";
import { NodeSnapshotEnvironment } from "@vitest/snapshot/environment";
import { resetMockAgent } from "cloudflare:mock-agent";
import { internalEnv, fetchMock } from "cloudflare:test-internal";
import { VitestTestRunner } from "vitest/runners";
import type { CancelReason, Suite, Test } from "@vitest/runner";
import type { ResolvedConfig, WorkerGlobalState, WorkerRPC } from "vitest";

// When `DEBUG` is `true`, runner operations will be logged and slowed down
// TODO(soon): remove this
const DEBUG = false;
const _ = (n: number) => " ".repeat(n);

// Define a custom `SnapshotEnvironment` that uses a service binding for file
// system operations, rather than `node:fs`
// Based on https://github.com/vitest-dev/vitest/blob/v1.0.0-beta.5/packages/vitest/src/integrations/snapshot/environments/node.ts
class WorkersSnapshotEnvironment extends NodeSnapshotEnvironment {
	constructor(private rpc: WorkerRPC) {
		super();
	}

	#fetch(method: string, path: string, body?: BodyInit): Promise<Response> {
		const encodedPath = encodeURIComponent(path);
		const url = `http://placeholder/snapshot?path=${encodedPath}`;
		return internalEnv.__VITEST_POOL_WORKERS_LOOPBACK_SERVICE.fetch(url, {
			method,
			body,
		});
	}

	getHeader(): string {
		return `// Vitest Snapshot v${this.getVersion()}, https://vitest.dev/guide/snapshot.html`;
	}

	resolvePath(filePath: string): Promise<string> {
		return this.rpc.resolveSnapshotPath(filePath);
	}

	async prepareDirectory(dirPath: string): Promise<void> {
		const res = await this.#fetch("POST", dirPath);
		assert.strictEqual(res.status, 204);
	}

	async saveSnapshotFile(filePath: string, snapshot: string): Promise<void> {
		const res = await this.#fetch("PUT", filePath, snapshot);
		assert.strictEqual(res.status, 204);
	}

	async readSnapshotFile(filePath: string): Promise<string | null> {
		const res = await this.#fetch("GET", filePath);
		if (res.status === 404) return null;
		assert.strictEqual(res.status, 200);
		return await res.text();
	}

	async removeSnapshotFile(filePath: string): Promise<void> {
		const res = await this.#fetch("DELETE", filePath);
		assert.strictEqual(res.status, 204);
	}
}

let initialState: WorkerGlobalState | undefined;
let patchedPrepareStackTrace = false;
const getConsoleGetFileName = () => () => "node:internal/console/constructor";

export default class WorkersTestRunner extends VitestTestRunner {
	readonly state: WorkerGlobalState;

	constructor(config: ResolvedConfig) {
		super(config);

		// @ts-expect-error `this.workerState` has "private" access, how quaint :D
		const state: WorkerGlobalState = this.workerState;
		this.state = state;

		// Make sure we're using a `WorkersSnapshotEnvironment`
		const opts = state.config.snapshotOptions;
		if (!(opts.snapshotEnvironment instanceof WorkersSnapshotEnvironment)) {
			opts.snapshotEnvironment = new WorkersSnapshotEnvironment(state.rpc);
		}

		// If this is the first run in this isolate, store a reference to the state.
		// Vitest only sets up its `console.log()` interceptor on the first run
		// (https://github.com/vitest-dev/vitest/blob/v1.0.0-beta.5/packages/vitest/src/runtime/setup-node.ts#L58),
		// and will use the `state` of the first run. Unfortunately, `state` is
		// recreated on each run. In particular, `state.rpc` will be hooked up with
		// a different `WebSocket` that gets closed at the end of each run. To
		// prevent `Can't call WebSocket send() after close()` errors, update the
		// initial state's `rpc` with the current `rpc`. Similarly, make sure
		// `initialState.current` is updated with the current task later on so
		// `console.log()`s report their current test correctly.
		initialState ??= state;
		initialState.rpc = state.rpc;

		// Vitests expects `node:console`s filename to start with `node:internal/console/`:
		// https://github.com/vitest-dev/vitest/blob/v1.0.0-beta.5/packages/vitest/src/runtime/console.ts#L16
		if (!patchedPrepareStackTrace) {
			patchedPrepareStackTrace = true;
			const originalPrepareStackTrace = Error.prepareStackTrace;
			assert(originalPrepareStackTrace !== undefined);
			Error.prepareStackTrace = (err, callSites) => {
				for (const callSite of callSites) {
					const fileName = callSite.getFileName();
					if (fileName?.endsWith("/dist/worker/lib/node/console.mjs")) {
						Object.defineProperty(callSite, "getFileName", {
							get: getConsoleGetFileName,
						});
					}
				}
				return originalPrepareStackTrace(err, callSites);
			};
		}
	}

	syncCurrentTaskWithInitialState() {
		assert(initialState !== undefined); // Assigned in constructor
		initialState.current = this.state.current;
	}

	async onBeforeRunFiles() {
		if (DEBUG) {
			__console.log("onBeforeRunFiles");
			await scheduler.wait(100);
		}

		resetMockAgent(fetchMock);
		return super.onBeforeRunFiles();
	}
	async onAfterRunFiles() {
		if (DEBUG) {
			__console.log("onAfterRunFiles");
			await scheduler.wait(100);
		}
		return super.onAfterRunFiles();
	}

	async onBeforeRunSuite(suite: Suite) {
		if (DEBUG) {
			__console.log(`${_(2)}onBeforeRunSuite: ${suite.name}`);
			await scheduler.wait(100);
		}
		return super.onBeforeRunSuite(suite);
	}
	async onAfterRunSuite(suite: Suite) {
		if (DEBUG) {
			__console.log(`${_(2)}onAfterRunSuite: ${suite.name}`);
			await scheduler.wait(100);
		}
		return super.onAfterRunSuite(suite);
	}

	async onBeforeRunTask(test: Test) {
		if (DEBUG) {
			__console.log(`${_(4)}onBeforeRunTask: ${test.name}`);
			await scheduler.wait(100);
		}
		const result = await super.onBeforeRunTask(test);
		// Current task may be updated in `super.onBeforeRunTask()`:
		// https://github.com/vitest-dev/vitest/blob/v1.0.0-beta.5/packages/vitest/src/runtime/runners/test.ts#L68
		this.syncCurrentTaskWithInitialState();
		return result;
	}
	async onAfterRunTask(test: Test) {
		if (DEBUG) {
			__console.log(`${_(4)}onAfterRunTask: ${test.name}`);
			await scheduler.wait(100);
		}
		const result = await super.onAfterRunTask(test);
		// Current task updated in `super.onAfterRunTask()`:
		// https://github.com/vitest-dev/vitest/blob/v1.0.0-beta.5/packages/vitest/src/runtime/runners/test.ts#L47
		this.syncCurrentTaskWithInitialState();
		return result;
	}

	async onBeforeTryTask(test: Test) {
		if (DEBUG) {
			__console.log(`${_(6)}onBeforeTryTask: ${test.name}`);
			await scheduler.wait(100);
		}
		return super.onBeforeTryTask(test);
	}
	async onAfterTryTask(test: Test) {
		if (DEBUG) {
			__console.log(`${_(6)}onAfterTryTask: ${test.name}`);
			await scheduler.wait(100);
		}
		return super.onAfterTryTask(test);
	}

	async onCancel(reason: CancelReason) {
		if (DEBUG) {
			__console.log(`onCancel: ${reason}`);
			await scheduler.wait(100);
		}
		return super.onCancel(reason);
	}
}
