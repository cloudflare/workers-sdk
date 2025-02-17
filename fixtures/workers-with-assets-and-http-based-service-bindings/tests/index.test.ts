import { resolve } from "node:path";
import { setTimeout } from "timers/promises";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("[Workers + Assets] HTTP-based service bindings to a Worker with assets", () => {
	let ipWorkerA: string,
		portWorkerA: number,
		stopWorkerA: (() => Promise<unknown>) | undefined;
	let ipWorkerB: string,
		portWorkerB: number,
		stopWorkerB: (() => Promise<unknown>) | undefined,
		getOutputWorkerB: () => string;

	beforeAll(async () => {
		// run WokerA and WorkerB in two separate wrangler dev sessions
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

	// First, assert that WorkerB works as intended. This is mainly a sanity check that our
	// test suite was configured correctly
	describe("WorkerB", () => {
		it("should respond with static asset content", async ({ expect }) => {
			let response = await fetch(
				`http://${ipWorkerB}:${portWorkerB}/index.html`
			);
			let text = await response.text();
			expect(response.status).toBe(200);
			expect(text).toContain('This is an asset of "worker-🐝"');
		});

		it("should return User Worker response", async ({ expect }) => {
			let response = await fetch(
				`http://${ipWorkerB}:${portWorkerB}/no-assets-at-this-path`
			);
			let text = await response.text();
			expect(response.status).toBe(200);
			expect(text).toContain("Hello from worker-🐝 fetch()");
		});

		it("should respond to cron trigger", async ({ expect }) => {
			let response = await fetch(
				`http://${ipWorkerB}:${portWorkerB}/__scheduled`
			);
			let text = await response.text();
			expect(response.status).toBe(200);
			expect(text).toContain("Ran scheduled event");

			// add a timeout to allow stdout to update
			await setTimeout(500);
			expect(getOutputWorkerB()).toContain("Hello from worker-🐝 scheduled()");
		});
	});

	// Once we asserted that WokrerB works correctly, we are ready to test WorkerA
	describe("WorkerA", () => {
		it("should return the correct responses for requests sent via the service binding", async ({
			expect,
		}) => {
			let response = await fetch(`http://${ipWorkerA}:${portWorkerA}`);
			let text = await response.text();
			expect(response.status).toBe(200);

			// incorrectly returns worker-b's User Worker response for routes that should be serving static content instead
			expect(text).toContain(
				"env.WORKER_B.fetch() response: Hello from worker-🐝 fetch()"
			);

			// should return worker-b's User Worker response
			expect(text).toContain(
				"env.WORKER_B.foo() response: Hello from worker-🐝 foo()"
			);

			// should return worker-b's cron trigger response
			expect(text).toContain(
				"env.WORKER_B.scheduled() response: worker-🐝 cron processed"
			);
		});
	});
});
