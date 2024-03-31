import assert from "node:assert";
import { NodeSnapshotEnvironment } from "@vitest/snapshot/environment";
import { resetMockAgent } from "cloudflare:mock-agent";
import {
	fetchMock,
	getSerializedOptions,
	internalEnv,
	waitForGlobalWaitUntil,
} from "cloudflare:test-internal";
import { VitestTestRunner } from "vitest/runners";
import workerdUnsafe from "workerd:unsafe";
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

interface TryOptions {
	repeats: number;
	retry: number;
}

type TryKey = `${number}:${number}`;
function getTryKey({ repeats, retry }: TryOptions): TryKey {
	return `${repeats}:${retry}`;
}

interface TryState {
	active?: TryKey;
	popped: Set<TryKey>;
}
const tryStates = new WeakMap<Test, TryState>();

export default class WorkersTestRunner extends VitestTestRunner {
	readonly state: WorkerGlobalState;
	readonly isolatedStorage: boolean;

	constructor(config: ResolvedConfig) {
		super(config);

		// @ts-expect-error `this.workerState` has "private" access, how quaint :D
		const state: WorkerGlobalState = this.workerState;
		this.state = state;

		const { isolatedStorage } = getSerializedOptions();
		this.isolatedStorage = isolatedStorage ?? false;

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
			// Need to patch this after Vitest's own source mapping handler installed
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

	async updateStackedStorage(
		action: "push" | "pop",
		source: Test | Suite
	): Promise<void> {
		if (!this.isolatedStorage) return;

		// Ensure all `ctx.waitUntil()` calls complete before aborting all objects.
		// `ctx.waitUntil()`s may contain storage calls (e.g. caching responses)
		// that could re-create Durable Objects and interrupt stack operations.
		await waitForGlobalWaitUntil();

		// Abort all Durable Objects apart from those marked with `preventEviction`
		// (i.e. the runner object and the proxy server).
		// On push, ensures objects are started with newly copied `.sqlite` files.
		// On pop, ensures SQLite WAL checkpoint, allowing us to just copy `.sqlite` files.
		await workerdUnsafe.abortAllDurableObjects();

		// Send request to pool loopback service to update `.sqlite` files
		const url = "http://placeholder/storage";
		const sourceString = `${source.file?.name ?? "an unknown file"}'s ${
			source.type
		} ${JSON.stringify(source.name)}`;

		const res = await internalEnv.__VITEST_POOL_WORKERS_LOOPBACK_SERVICE.fetch(
			url,
			{
				method: action === "pop" ? "DELETE" : "POST",
				headers: { "MF-Vitest-Source": sourceString },
			}
		);
		assert.strictEqual(res.status, 204, await res.text());
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

		// Ensure all `ctx.waitUntil()` calls complete before disposing the runtime
		// (if using `vitest run`) and aborting all objects. `ctx.waitUntil()`s may
		// contain storage calls (e.g. caching responses) that could try to access
		// aborted Durable Objects.
		await waitForGlobalWaitUntil();
		return super.onAfterRunFiles?.();
	}

	async onBeforeRunSuite(suite: Suite) {
		if (DEBUG) {
			__console.log(`${_(2)}onBeforeRunSuite: ${suite.name}`);
			await scheduler.wait(100);
		}
		await this.updateStackedStorage("push", suite);

		return super.onBeforeRunSuite(suite);
	}
	async onAfterRunSuite(suite: Suite) {
		if (DEBUG) {
			__console.log(`${_(2)}onAfterRunSuite: ${suite.name}`);
			await scheduler.wait(100);
		}
		await this.updateStackedStorage("pop", suite);

		return super.onAfterRunSuite(suite);
	}

	async ensurePoppedActiveTryStorage(
		test: Test,
		newActive?: TryKey
	): Promise<boolean /* popped */> {
		const tries = tryStates.get(test);
		assert(tries !== undefined);
		const active = tries.active;
		if (newActive !== undefined) tries.active = newActive;
		if (active !== undefined && !tries.popped.has(active)) {
			tries.popped.add(active);
			await this.updateStackedStorage("pop", test);
			return true;
		}
		return false;
	}

	async onBeforeRunTask(test: Test) {
		if (DEBUG) {
			__console.log(`${_(4)}onBeforeRunTask: ${test.name}`);
			await scheduler.wait(100);
		}

		tryStates.set(test, { popped: new Set() });
		if (this.isolatedStorage && test.concurrent) {
			const quotedName = JSON.stringify(test.name);
			const msg = [
				"Concurrent tests are unsupported with isolated storage. Please either:",
				`- Remove \`.concurrent\` from the ${quotedName} test`,
				`- Remove \`.concurrent\` from all \`describe()\` blocks containing the ${quotedName} test`,
				"- Remove `isolatedStorage: true` from your project's Vitest config",
			];
			throw new Error(msg.join("\n"));
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

		// If we haven't popped storage for the test yet (i.e. the try threw,
		// `onAfterTryTask()` wasn't called, and we didn't enable retries so
		// `onBeforeTryTask()` wasn't called again), pop it
		await this.ensurePoppedActiveTryStorage(test);
		tryStates.delete(test);

		const result = await super.onAfterRunTask(test);
		// Current task updated in `super.onAfterRunTask()`:
		// https://github.com/vitest-dev/vitest/blob/v1.0.0-beta.5/packages/vitest/src/runtime/runners/test.ts#L47
		this.syncCurrentTaskWithInitialState();
		return result;
	}

	// @ts-expect-error `VitestRunner` defines an additional `options` parameter
	//  that `VitestTestRunner` doesn't use
	async onBeforeTryTask(test: Test, options: TryOptions) {
		if (DEBUG) {
			__console.log(`${_(6)}onBeforeTryTask: ${test.name}`, options);
			await scheduler.wait(100);
		}

		// If we haven't popped storage for the previous try yet (i.e. the try
		// threw and `onAfterTryTask()` wasn't called), pop it first...
		const newActive = getTryKey(options);
		await this.ensurePoppedActiveTryStorage(test, newActive);

		await this.updateStackedStorage("push", test);
		return super.onBeforeTryTask(test);
	}
	// @ts-expect-error `VitestRunner` defines an additional `options` parameter
	//  that `VitestTestRunner` doesn't use
	async onAfterTryTask(test: Test, options: TryOptions) {
		if (DEBUG) {
			__console.log(`${_(6)}onAfterTryTask: ${test.name}`, options);
			await scheduler.wait(100);
		}

		// Pop storage for this try, asserting that we haven't done so already.
		// `onAfterTryTask()` is never called multiple times for the same try,
		// `onBeforeTryTask()` will only be called with a new try after this,
		// and `onAfterRunTask()` will only be called after all tries.
		assert(await this.ensurePoppedActiveTryStorage(test));

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
