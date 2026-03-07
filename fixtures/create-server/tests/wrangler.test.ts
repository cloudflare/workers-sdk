import * as path from "node:path";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createServer } from "wrangler";

const mockServer = setupServer(
	http.get("http://example.com/:worker/:phase", ({ params }) => {
		const worker = String(params.worker);
		const phase = String(params.phase);
		const key = `${worker}:${phase}`;
		return HttpResponse.text(`mock:${key}`);
	})
);
const workerServer = createServer({
	root: path.resolve(__dirname, ".."),
	build: {
		workers: [
			{
				configPath: "wrangler.primary.jsonc",
				dev: {
					server: { hostname: "127.0.0.1", port: 0 },
					inspector: false,
				},
			},
			{
				configPath: "wrangler.auxiliary.jsonc",
				dev: {
					inspector: false,
				},
			},
		],
	},
	outbound: (request) => fetch(request.url, request),
});
const primary = workerServer.getWorker();
const auxiliary = workerServer.getWorker("auxiliary-worker");

describe("createServer integration: wrangler build flow", () => {
	beforeAll(async () => {
		mockServer.listen({ onUnhandledRequest: "error" });
		await workerServer.listen();
	});

	afterAll(async () => {
		mockServer.close();
		await workerServer.close();
	});

	it("handles fetch + scheduled for primary and auxiliary workers", async ({
		expect,
	}) => {
		const primaryResponse = await primary.fetch("http://example.com", {
			signal: AbortSignal.timeout(10_000),
		});
		expect(await primaryResponse.json()).toEqual({
			worker: "primary",
			fetchMock: "mock:primary:fetch",
			lastScheduledMock: "not-run",
		});
		const auxiliaryResponse = await auxiliary.fetch("http://example.com", {
			signal: AbortSignal.timeout(10_000),
		});
		expect(await auxiliaryResponse.json()).toEqual({
			worker: "auxiliary",
			fetchMock: "mock:auxiliary:fetch",
			lastScheduledMock: "not-run",
		});

		expect(
			await primary.scheduled({
				cron: "* * * * *",
				scheduledTime: new Date(1_700_000_000_000),
			})
		).toEqual({ outcome: "ok", noRetry: false });
		expect(
			await auxiliary.scheduled({
				cron: "*/5 * * * *",
				scheduledTime: new Date(1_700_000_001_000),
			})
		).toEqual({ outcome: "ok", noRetry: false });
	});
});
