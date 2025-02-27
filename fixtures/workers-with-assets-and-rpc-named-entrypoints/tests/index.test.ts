import { resolve } from "node:path";
import { setTimeout } from "timers/promises";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("[Workers + Assets] RPC-based service bindings to named entrypoints", () => {
	describe("Workers running in separate wrangler dev sessions", () => {
		let ipWorkerA: string,
			portWorkerA: number,
			stopWorkerA: (() => Promise<unknown>) | undefined;
		let ipWorkerB: string,
			portWorkerB: number,
			stopWorkerB: (() => Promise<unknown>) | undefined,
			getOutputWorkerB: () => string;

		beforeAll(async () => {
			({
				ip: ipWorkerB,
				port: portWorkerB,
				stop: stopWorkerB,
				getOutput: getOutputWorkerB,
			} = await runWranglerDev(resolve(__dirname, "..", "workerB"), [
				"--port=0",
				"--inspector-port=0",
				// we need this flag in order to be able to test Cron Triggers
				// see https://developers.cloudflare.com/workers/examples/cron-trigger/#test-cron-triggers-using-wrangler
				"--test-scheduled",
			]));

			({
				ip: ipWorkerA,
				port: portWorkerA,
				stop: stopWorkerA,
			} = await runWranglerDev(resolve(__dirname, "..", "workerA"), [
				"--port=0",
				"--inspector-port=0",
			]));
		});

		afterAll(async () => {
			await stopWorkerA?.();
			await stopWorkerB?.();
		});

		/*
		 * Assert that WorkerB works as intended.
		 * This is mainly a sanity check that our test suite was configured correctly
		 */
		describe("WorkerB", () => {
			it("should respond with static asset content", async ({ expect }) => {
				let response = await fetch(
					`http://${ipWorkerB}:${portWorkerB}/index.html`
				);
				let text = await response.text();
				expect(response.status).toBe(200);
				expect(text).toContain('This is an asset of "worker-🐝"');

				response = await fetch(`http://${ipWorkerB}:${portWorkerB}/busy-bee`);
				text = await response.text();
				expect(response.status).toBe(200);
				expect(text).toContain("All 🐝🐝🐝 are 🐝sy. Please come back later.");
			});

			it("should return User Worker response", async ({ expect }) => {
				let response = await fetch(
					`http://${ipWorkerB}:${portWorkerB}/no-assets-at-this-path`
				);
				let text = await response.text();
				expect(response.status).toBe(200);
				expect(text).toContain(
					"Hello from worker-🐝 default entrypoint fetch()"
				);
			});

			it("should respond to cron trigger", async ({ expect }) => {
				let response = await fetch(
					`http://${ipWorkerB}:${portWorkerB}/__scheduled`
				);
				let text = await response.text();
				expect(response.status).toBe(200);
				expect(text).toContain("Ran scheduled event");

				// for some reason scheduled() never logs to stdout, but no idea why
				// add a timeout to allow stdout to update
				// await setTimeout(500);
				// expect(getOutputWorkerB()).toContain(
				// 	"Hello from worker-🐝 scheduled()"
				// );
			});
		});

		/*
		 * Assert that WorkerA works as intended
		 */
		describe("WorkerA", () => {
			// [[ CURRENTLY BROKEN ]]
			// this incorrectly returns worker-b's User Worker response instead of the
			// Asset Worker response
			it("should return Asset Worker response for worker-b routes that serve static content", async ({
				expect,
			}) => {
				let response = await fetch(`http://${ipWorkerA}:${portWorkerA}`);
				let text = await response.text();
				expect(response.status).toBe(200);
				expect(text).toContain(
					"env.WORKER_B.fetch() response: Hello from worker-🐝 fetch()"
				);

				response = await fetch(`http://${ipWorkerA}:${portWorkerA}/busy-bee`);
				text = await response.text();
				expect(response.status).toBe(200);
				expect(text).toContain(
					"env.WORKER_B.fetch() response: Hello from worker-🐝 fetch()"
				);
			});

			it("should return User Worker fetch response for worker-b routes that don't serve static content", async ({
				expect,
			}) => {
				let response = await fetch(
					`http://${ipWorkerA}:${portWorkerA}/no-assets-at-this-path`
				);
				let text = await response.text();
				expect(response.status).toBe(200);
				expect(text).toContain(
					"env.WORKER_B.fetch() response: Hello from worker-🐝 fetch()"
				);
			});

			it("should return User Worker response for named functions defined on worker-b", async ({
				expect,
			}) => {
				// fetch URL is irrelevant here. workerA will internally call
				// `env.WORKER_B.bee()`/`env.WORKER_B.busyBee(<param>)` instead
				let response = await fetch(`http://${ipWorkerA}:${portWorkerA}`);
				let text = await response.text();
				expect(response.status).toBe(200);
				expect(text).toContain(
					"env.WORKER_B.bee() response: Hello from worker-🐝 bee()"
				);
				expect(text).toContain(
					'env.WORKER_B.busyBee("🐝") response: Hello busy 🐝s from worker-🐝 busyBee(bee)'
				);
			});

			it("should return worker-b's cron trigger response", async ({
				expect,
			}) => {
				// fetch URL is irrelevant here. workerA will internally call
				// `http://fakehost/cdn-cgi/mf/scheduled` instead
				let response = await fetch(`http://${ipWorkerA}:${portWorkerA}`);
				let text = await response.text();
				expect(response.status).toBe(200);
				expect(text).toContain("env.WORKER_B.scheduled() response: undefined");
			});
		});
	});

	describe.todo("Workers running in the same wrangler dev session", () => {});
});
