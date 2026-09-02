import { afterEach, describe, test } from "vitest";
import { page, viteUrl } from "./utils";

const WORKERS_ROUTE = "**/cdn-cgi/local/explorer/api/local/workers";
const EMAIL_ROUTING_DETAIL_ROUTE =
	"**/cdn-cgi/local/explorer/api/local/email/routing?*";

function createWorkers(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		isSelf: index === 0,
		name: `worker-${index + 1}`,
	}));
}

async function loadWorkers(count: number): Promise<void> {
	await page.route(WORKERS_ROUTE, async (route) => {
		await route.fulfill({
			contentType: "application/json",
			body: JSON.stringify({
				errors: [],
				messages: [],
				result: createWorkers(count),
				success: true,
			}),
		});
	});

	await page.goto(viteUrl);
}

function waitForWorkersResponse() {
	return page.waitForResponse((response) =>
		response.url().endsWith("/cdn-cgi/local/explorer/api/local/workers")
	);
}

async function mockEmailRoutingDetail(): Promise<void> {
	await page.route(EMAIL_ROUTING_DETAIL_ROUTE, async (route) => {
		const emailId = new URL(route.request().url()).searchParams.get("email_id");
		await route.fulfill({
			contentType: "application/json",
			body: JSON.stringify({
				errors: [],
				messages: emailId
					? [
							{
								code: 10604,
								message:
									"Displayed received email content was truncated during local capture. The complete message was still delivered to the Worker.",
							},
						]
					: [],
				result: emailId
					? {
							attachments: [],
							events: [],
							forwards: [],
							from: "sender@example.com",
							html: "<p>Rendered received HTML body</p>",
							messageId: "<test-email-id>",
							outcome: "ok",
							raw: "Content-Type: text/plain\r\n\r\nPlain received text body",
							rawSize: 42,
							receivedAt: "2024-01-01T00:00:00.000Z",
							replies: [],
							subject: "Test email",
							text: "Plain received text body",
							to: "recipient@example.com",
						}
					: [],
				result_info: emailId
					? undefined
					: { count: 0, has_more: false, per_page: 25 },
				success: true,
			}),
		});
	});
}

afterEach(async () => {
	await page.unroute(WORKERS_ROUTE);
	await page.unroute(EMAIL_ROUTING_DETAIL_ROUTE);
});

describe("worker selector", () => {
	test("canonicalizes missing and invalid workers before loading email data", async ({
		expect,
	}) => {
		const requestedWorkers: Array<string | null> = [];
		await page.route(EMAIL_ROUTING_DETAIL_ROUTE, async (route) => {
			const search = new URL(route.request().url()).searchParams;
			const emailId = search.get("email_id");
			requestedWorkers.push(search.get("worker"));
			await route.fulfill({
				contentType: "application/json",
				body: JSON.stringify({
					errors: [],
					messages: [],
					result: emailId
						? {
								attachments: [],
								events: [],
								forwards: [],
								from: "sender@example.com",
								messageId: "<test-email-id>",
								outcome: "ok",
								raw: "Content-Type: text/plain\r\n\r\nBody",
								rawSize: 4,
								receivedAt: "2026-08-24T00:00:00.000Z",
								replies: [],
								subject: "Direct email",
								text: "Body",
								to: "recipient@example.com",
							}
						: [],
					result_info: emailId
						? undefined
						: { count: 0, has_more: false, per_page: 10 },
					success: true,
				}),
			});
		});
		await loadWorkers(2);

		await page.goto(
			new URL("/cdn-cgi/local/explorer/email/routing", viteUrl).toString()
		);
		await expect
			.poll(() => new URL(page.url()).searchParams.get("worker"))
			.toBe("worker-1");
		await expect.poll(() => requestedWorkers.length).toBeGreaterThan(0);
		expect(requestedWorkers.every((worker) => worker === "worker-1")).toBe(
			true
		);

		requestedWorkers.length = 0;
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=missing-worker",
				viteUrl
			).toString()
		);
		await expect
			.poll(() => new URL(page.url()).searchParams.get("worker"))
			.toBe("worker-1");
		await expect.poll(() => requestedWorkers.length).toBeGreaterThan(0);
		expect(requestedWorkers.every((worker) => worker === "worker-1")).toBe(
			true
		);

		requestedWorkers.length = 0;
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing/test-email-id",
				viteUrl
			).toString()
		);
		await expect
			.poll(() => new URL(page.url()).searchParams.get("worker"))
			.toBe("worker-1");
		await page.getByText("Direct email").last().waitFor();
		await page.getByText("test-email-id", { exact: true }).waitFor();
		expect(
			await page.getByText("<test-email-id>", { exact: true }).count()
		).toBe(0);
		await expect.poll(() => requestedWorkers.length).toBeGreaterThan(0);
		expect(requestedWorkers.every((worker) => worker === "worker-1")).toBe(
			true
		);
	});

	test("discards stale email lists after switching workers", async ({
		expect,
	}) => {
		let releaseStaleResponse: (() => void) | undefined;
		const staleResponse = new Promise<void>((resolve) => {
			releaseStaleResponse = resolve;
		});
		let workerOneRequests = 0;
		await page.route(EMAIL_ROUTING_DETAIL_ROUTE, async (route) => {
			const worker = new URL(route.request().url()).searchParams.get("worker");
			workerOneRequests += worker === "worker-1" ? 1 : 0;
			if (worker === "worker-1" && workerOneRequests === 2) {
				await staleResponse;
			}
			const subject = worker === "worker-2" ? "Worker two email" : "Old email";
			await route.fulfill({
				contentType: "application/json",
				body: JSON.stringify({
					errors: [],
					messages: [],
					result: [
						{
							attachments: [],
							events: [],
							forwards: [],
							from: "sender@example.com",
							messageId: `<${worker}-${workerOneRequests}>`,
							outcome: "ok",
							rawSize: 1,
							receivedAt: "2026-08-24T00:00:00.000Z",
							replies: [],
							subject,
							to: "recipient@example.com",
						},
					],
					result_info: { count: 1, has_more: false, per_page: 10 },
					success: true,
				}),
			});
		});
		await loadWorkers(2);
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		await page.getByRole("button", { name: /Old email/ }).waitFor();
		await page.getByRole("button", { name: "Refresh" }).click();
		await page.getByRole("combobox").click();
		await page.getByRole("option", { name: "worker-2" }).click();
		await page.getByRole("button", { name: /Worker two email/ }).waitFor();
		releaseStaleResponse?.();
		await page.waitForTimeout(100);

		expect(await page.getByRole("button", { name: /Old email/ }).count()).toBe(
			0
		);
	});

	test("stays hidden when there is only one worker", async ({ expect }) => {
		await loadWorkers(1);

		expect(await page.getByRole("combobox").count()).toBe(0);
	});

	test("keeps nine workers fully visible", async ({ expect }) => {
		await loadWorkers(9);

		await page.getByRole("combobox").click();
		const listBounds = await page.getByRole("listbox").boundingBox();
		const lastOptionBounds = await page
			.getByRole("option", { name: "worker-9" })
			.boundingBox();

		expect(listBounds).not.toBeNull();
		expect(lastOptionBounds).not.toBeNull();
		if (listBounds && lastOptionBounds) {
			expect(lastOptionBounds.y + lastOptionBounds.height).toBeLessThanOrEqual(
				listBounds.y + listBounds.height
			);
		}
	});

	test("scrolls to and selects workers beyond the visible limit", async ({
		expect,
	}) => {
		await page.setViewportSize({ height: 720, width: 1280 });
		await loadWorkers(12);

		await page.getByRole("combobox").click();
		const list = page.getByRole("listbox");

		const dimensions = await list.evaluate((element) => ({
			clientHeight: element.clientHeight,
			scrollHeight: element.scrollHeight,
		}));
		expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);

		const main = page.locator("main");
		const pageScrollTop = await main.evaluate((element) => element.scrollTop);
		await list.hover();
		await page.mouse.wheel(0, dimensions.scrollHeight);
		await expect
			.poll(async () => await list.evaluate((element) => element.scrollTop))
			.toBeGreaterThan(0);
		expect(await main.evaluate((element) => element.scrollTop)).toBe(
			pageScrollTop
		);

		const workersResponse = waitForWorkersResponse();
		await page.getByRole("option", { name: "worker-12" }).click();
		await workersResponse;
		await expect
			.poll(() => new URL(page.url()).searchParams.get("worker"))
			.toBe("worker-12");
		await page.getByRole("combobox").getByText("worker-12").waitFor();
		await page.waitForLoadState("networkidle");
	});

	test("reaches later workers with the keyboard in a narrow viewport", async ({
		expect,
	}) => {
		await loadWorkers(12);
		await page.setViewportSize({ height: 640, width: 800 });

		await page.getByRole("combobox").click({ timeout: 5_000 });
		const list = page.getByRole("listbox");
		const lastOption = page.getByRole("option", { name: "worker-12" });
		let reachedLastOption = false;
		for (let index = 0; index < 12; index++) {
			await page.keyboard.press("ArrowDown");
			reachedLastOption =
				(await lastOption.getAttribute("data-highlighted")) !== null;
			if (reachedLastOption) {
				break;
			}
		}
		expect(reachedLastOption).toBe(true);
		expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(
			0
		);
		const workersResponse = waitForWorkersResponse();
		await page.keyboard.press("Enter");
		await workersResponse;

		await expect
			.poll(() => new URL(page.url()).searchParams.get("worker"))
			.toBe("worker-12");
		await page.getByRole("combobox").getByText("worker-12").waitFor();
		await page.waitForLoadState("networkidle");
	});

	test("returns to the routing list when switching workers on the email detail page", async ({
		expect,
	}) => {
		await mockEmailRoutingDetail();
		await loadWorkers(2);
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing/test-email-id?worker=worker-1",
				viteUrl
			).toString()
		);
		await page.waitForLoadState("networkidle");
		await page.getByRole("button", { name: /^Content/ }).click();
		await page
			.getByText(/complete email was delivered to the Worker/)
			.first()
			.waitFor();
		expect(
			await page.getByText("Plain received text body", { exact: true }).count()
		).toBe(0);
		expect(
			await page
				.locator('iframe[title="Rendered received HTML email body"]')
				.count()
		).toBe(0);

		const workersResponse = waitForWorkersResponse();
		await page.getByRole("combobox").click();
		await page.getByRole("option", { name: "worker-2" }).click();
		await workersResponse;

		// Switching workers on the detail page redirects back to the parent
		// "Routing" list, carrying the newly selected worker forward.
		await expect
			.poll(() => new URL(page.url()).pathname)
			.toMatch(/\/email\/routing$/);
		await expect
			.poll(() => new URL(page.url()).searchParams.get("worker"))
			.toBe("worker-2");

		// The redirect belongs to the selector action. Browser history can still
		// restore the previous worker's valid email detail page.
		await page.goBack();
		await expect
			.poll(() => new URL(page.url()).pathname)
			.toMatch(/\/email\/routing\/test-email-id$/);
		await expect
			.poll(() => new URL(page.url()).searchParams.get("worker"))
			.toBe("worker-1");
	});
});
