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

export default class WorkersTestRunner extends VitestTestRunner {
	constructor(config: ResolvedConfig) {
		super(config);

		// Make sure we're using a `WorkersSnapshotEnvironment`
		// @ts-expect-error `this.workerState` has `private` access, but this isn't
		//  enforced at runtime :D
		const state: WorkerGlobalState = this.workerState;
		const opts = state.config.snapshotOptions;
		if (!(opts.snapshotEnvironment instanceof WorkersSnapshotEnvironment)) {
			opts.snapshotEnvironment = new WorkersSnapshotEnvironment(state.rpc);
		}
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
		return super.onBeforeRunTask(test);
	}
	async onAfterRunTask(test: Test) {
		if (DEBUG) {
			__console.log(`${_(4)}onAfterRunTask: ${test.name}`);
			await scheduler.wait(100);
		}
		return super.onAfterRunTask(test);
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
