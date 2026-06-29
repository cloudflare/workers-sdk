import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	test,
} from "vitest";
import { createTestHarness } from "wrangler";

// Point each worker to the Wrangler config you want to test.
const server = createTestHarness({
	workers: [
		{
			configPath: "./workers/web/wrangler.jsonc",
			bindingOverrides: { BROWSER: "mock-browser" },
		},
		{ configPath: "./workers/api/wrangler.jsonc" },
		{ configPath: "./workers/mock-browser/wrangler.jsonc" },
	],
});

// server.getWorker() would return the first Worker, but naming it makes it explicit.
const webWorker = server.getWorker<
	WebEnv,
	typeof import("../workers/web/index")
>("web-worker");
const apiWorker = server.getWorker<
	ApiEnv,
	typeof import("../workers/api/index")
>("api-worker");
const mockBrowserWorker = server.getWorker<
	unknown,
	typeof import("../workers/mock-browser/index")
>("mock-browser");

// Workers started by createTestHarness route outbound fetches to globalThis.fetch().
// You can use libraries like MSW to intercept those requests.
const network = setupServer();

describe("createTestHarness: Vitest setup", () => {
	beforeAll(async () => {
		network.listen({ onUnhandledRequest: "error" });
		await server.listen();
	});

	beforeEach(async () => {
		await apiWorker.applyD1Migrations("DATABASE");
	});

	afterAll(async () => {
		network.close();
		await server.close();
	});

	afterEach(async () => {
		// Keep tests isolated while reusing the same running server.
		network.resetHandlers();
		await server.reset();
	});

	test("fetches the primary Worker with a relative URL", async ({ expect }) => {
		// Relative URLs are dispatched to the primary Worker (the first one listed).
		const response = await server.fetch("/");
		expect(await response.text()).toBe("Hello World");
	});

	test("mocks outbound requests", async ({ expect }) => {
		network.use(
			http.get("http://identity.example.com/profile/:id", ({ params }) => {
				return HttpResponse.json({ id: params.id, name: "Ada" });
			})
		);

		const userResponse = await apiWorker.fetch("/v1/users/123");
		expect(await userResponse.json()).toEqual({
			id: "123",
			name: "Ada",
		});
	});

	test("overrides a platform binding with a mock Worker", async ({
		expect,
	}) => {
		const apiEnv = await apiWorker.getEnv();
		await apiEnv.DATABASE.prepare(
			"INSERT INTO daily_reports (date, user_ids) VALUES (?, ?)"
		)
			.bind("2026-05-29", JSON.stringify(["123", "456"]))
			.run();

		const stubPng = Uint8Array.from([
			137, 80, 78, 71, 13, 10, 26, 10, 109, 111, 99, 107,
		]);
		const mockBrowser = await mockBrowserWorker.getExport();
		await mockBrowser.setScreenshot(Array.from(stubPng));

		const response = await webWorker.fetch("/reports/2026-05-29.png");
		expect(response.headers.get("content-type")).toBe("image/png");
		expect(await response.bytes()).toEqual(stubPng);
	});

	test("dispatches requests using configured routes", async ({ expect }) => {
		network.use(
			http.get("http://identity.example.com/profile/:id", ({ params }) => {
				return HttpResponse.json({ id: params.id, name: "Ada" });
			})
		);

		// server.fetch() matches requests to workers based on routes.
		const apiResponse = await server.fetch(
			"http://api.example.com/v1/users/123"
		);
		expect(await apiResponse.json()).toEqual({
			id: "123",
			name: "Ada",
		});

		const webResponse = await server.fetch("http://example.com/users/123");
		expect(await webResponse.text()).toBe("Profile: Ada");
	});

	test("runs scheduled jobs and stores the result", async ({ expect }) => {
		network.use(
			http.get("http://identity.example.com/profile/:id", ({ params }) => {
				return HttpResponse.json({ id: params.id, name: "Ada" });
			})
		);

		// Seed user data that the scheduled job will read to generate a report.
		await apiWorker.fetch("/v1/users/123");
		await apiWorker.fetch("/v1/users/456");

		const initialResponse = await webWorker.fetch("/reports/2026-05-29");
		expect(initialResponse.status).toBe(404);
		expect(await initialResponse.text()).toBe("No report");

		server.clearLogs();

		expect(
			await apiWorker.scheduled({
				cron: "0 0 * * *",
				scheduledTime: new Date("2026-05-29T00:00:00.000Z"),
			})
		).toEqual({ outcome: "ok", noRetry: false });
		expect(server.getLogs()).toContainEqual(
			expect.objectContaining({
				level: "info",
				message: "Generated daily report for 2026-05-29",
			})
		);

		const webResponse = await webWorker.fetch("/reports/2026-05-29");
		expect(await webResponse.text()).toBe(
			"Daily report (2026-05-29): active users 123, 456"
		);
	});
});
