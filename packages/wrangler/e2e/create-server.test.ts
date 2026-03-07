import dedent from "ts-dedent";
import { beforeEach, describe, it, onTestFinished } from "vitest";
import {
	importWrangler,
	WranglerE2ETestHelper,
} from "./helpers/e2e-wrangler-test";

const { createServer } = await importWrangler();

describe("createServer", { sequential: true }, () => {
	let helper: WranglerE2ETestHelper;

	beforeEach(() => {
		helper = new WranglerE2ETestHelper();
	});

	it("routes named worker fetch requests to the correct worker", async ({
		expect,
	}) => {
		await helper.seed({
			"wrangler-a.jsonc": dedent`
				{
					"name": "worker-a",
					"main": "worker-a.ts",
					"compatibility_date": "2024-09-23"
				}
			`,
			"wrangler-b.jsonc": dedent`
				{
					"name": "worker-b",
					"main": "worker-b.ts",
					"compatibility_date": "2024-09-23"
				}
			`,
			"worker-a.ts": dedent`
				export default {
					fetch() {
						return new Response("worker-a");
					},
				};
			`,
			"worker-b.ts": dedent`
				let lastCron = "never";
				let lastTime = "never";

				export default {
					fetch() {
						return new Response("worker-b:" + lastCron + ":" + lastTime);
					},
					scheduled(controller) {
						lastCron = controller.cron ?? "none";
						lastTime = String(controller.scheduledTime ?? "none");
					},
				};
			`,
		});

		const server = createServer({
			root: helper.tmpPath,
			build: {
				workers: [
					{
						configPath: "wrangler-a.jsonc",
						dev: {
							server: { hostname: "127.0.0.1", port: 0 },
							inspector: false,
						},
					},
					{
						configPath: "wrangler-b.jsonc",
						dev: {
							inspector: false,
						},
					},
				],
			},
		});
		onTestFinished(server.close);
		const defaultWorker = server.getWorker();
		const workerB = server.getWorker("worker-b");

		await server.listen();

		const defaultResponse = await defaultWorker.fetch("http://example.com", {
			signal: AbortSignal.timeout(10_000),
		});
		const namedBResponse = await workerB.fetch("http://example.com", {
			signal: AbortSignal.timeout(10_000),
		});
		const scheduledResult = await workerB.scheduled({
			cron: "*/5 * * * *",
			scheduledTime: new Date(1_700_000_000_000),
		});
		const namedBAfterSchedule = await workerB.fetch("http://example.com", {
			signal: AbortSignal.timeout(10_000),
		});

		expect(await defaultResponse.text()).toBe("worker-a");
		expect(await namedBResponse.text()).toBe("worker-b:never:never");
		expect(scheduledResult.outcome).toBe("ok");
		expect(await namedBAfterSchedule.text()).toBe(
			"worker-b:*/5 * * * *:1700000000000"
		);
	});
});
