import { resetMockAgent } from "cloudflare:mock-agent";
import { fetchMock } from "cloudflare:test";
import { VitestTestRunner } from "vitest/runners";
import type { CancelReason, Suite, Test } from "@vitest/runner";

// When `DEBUG` is `true`, runner operations will be logged and slowed down
// TODO(soon): remove this
const DEBUG = false;
const _ = (n: number) => " ".repeat(n);

export default class WorkersTestRunner extends VitestTestRunner {
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
