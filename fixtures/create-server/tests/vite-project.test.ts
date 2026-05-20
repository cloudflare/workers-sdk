import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createServer } from "wrangler";

const mockServer = setupServer(
	http.get("http://example.com/:worker", ({ params }) => {
		return HttpResponse.text(`mock:${params.worker}`);
	})
);
const workerServer = createServer({
	workers: [
		{ configPath: "./dist/primary_worker/wrangler.json" },
		{ configPath: "./dist/auxiliary_worker/wrangler.json" },
	],
});
const primaryWorker = workerServer.getWorker();
const auxiliaryWorker = workerServer.getWorker("auxiliary-worker");

describe("createServer: vite project setup", () => {
	beforeAll(async () => {
		mockServer.listen({ onUnhandledRequest: "error" });
		await workerServer.listen();
	});

	afterAll(async () => {
		mockServer.close();
		await workerServer.close();
	});

	it("could fetch workers with mocking support", async ({ expect }) => {
		const primaryResponse = await primaryWorker.fetch("http://example.com");
		await expect(primaryResponse.text()).resolves.toBe("mock:primary");
		const auxiliaryResponse = await auxiliaryWorker.fetch("http://example.com");
		await expect(auxiliaryResponse.text()).resolves.toBe("mock:auxiliary");
	});

	it("support triggering scheduled events with custom scheduledTime", async ({
		expect,
	}) => {
		const primaryScheduled = await primaryWorker.fetch(
			"http://example.com/scheduled"
		);
		await expect(primaryScheduled.text()).resolves.toBe("no cron triggered");

		await expect(
			primaryWorker.scheduled({
				cron: "* * * * *",
				scheduledTime: new Date(1_700_000_100_000),
			})
		).resolves.toEqual({ outcome: "ok", noRetry: false });

		const primaryResponse = await primaryWorker.fetch(
			"http://example.com/scheduled"
		);
		await expect(primaryResponse.text()).resolves.toBe("* * * * *");

		await expect(
			auxiliaryWorker.scheduled({
				cron: "*/5 * * * *",
				scheduledTime: new Date(1_700_000_101_000),
			})
		).resolves.toEqual({ outcome: "ok", noRetry: false });

		const auxiliaryResponse = await auxiliaryWorker.fetch(
			"http://example.com/scheduled"
		);
		await expect(auxiliaryResponse.text()).resolves.toBe("*/5 * * * *");
	});
});
