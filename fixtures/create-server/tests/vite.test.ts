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
	workers: [{ deployConfig: true }],
});
const primary = workerServer.getWorker();
const auxiliary = workerServer.getWorker("auxiliary-worker");

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
		const primaryResponse = await primary.fetch("http://example.com", {
			signal: AbortSignal.timeout(10_000),
		});
		expect(await primaryResponse.json()).toMatchObject({
			worker: "primary",
			mockResult: "mock:primary",
		});
		const auxiliaryResponse = await auxiliary.fetch("http://example.com", {
			signal: AbortSignal.timeout(10_000),
		});
		expect(await auxiliaryResponse.json()).toMatchObject({
			worker: "auxiliary",
			mockResult: "mock:auxiliary",
		});
	});

	it("support triggering scheduled events with custom scheduledTime", async ({
		expect,
	}) => {
		expect(
			await primary.scheduled({
				cron: "* * * * *",
				scheduledTime: new Date(1_700_000_100_000),
			})
		).toEqual({ outcome: "ok", noRetry: false });

		const primaryResponse = await primary.fetch("http://example.com", {
			signal: AbortSignal.timeout(10_000),
		});
		expect(await primaryResponse.json()).toMatchObject({
			lastTriggeredCron: "* * * * *",
		});

		expect(
			await auxiliary.scheduled({
				cron: "*/5 * * * *",
				scheduledTime: new Date(1_700_000_101_000),
			})
		).toEqual({ outcome: "ok", noRetry: false });

		const auxiliaryResponse = await auxiliary.fetch("http://example.com", {
			signal: AbortSignal.timeout(10_000),
		});
		expect(await auxiliaryResponse.json()).toMatchObject({
			lastTriggeredCron: "*/5 * * * *",
		});
	});
});
