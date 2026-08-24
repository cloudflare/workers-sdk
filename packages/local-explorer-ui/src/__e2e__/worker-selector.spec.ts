import { afterEach, describe, test } from "vitest";
import { page, viteUrl } from "./utils";

const WORKERS_ROUTE = "**/cdn-cgi/local/explorer/api/local/workers";
const EMAIL_ROUTING_DETAIL_ROUTE =
	"**/cdn-cgi/local/explorer/api/local/email/routing?*";
const EMAIL_ROUTING_SEND_ROUTE =
	"**/cdn-cgi/local/explorer/api/local/email/routing/send?*";

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
							messageId: "<test-email-id>",
							from: "sender@example.com",
							html: "<p>Rendered received HTML body</p>",
							outcome: "ok",
							raw: "Content-Type: text/plain\r\n\r\nPlain received text body",
							to: "recipient@example.com",
							subject: "Test email",
							text: "Plain received text body",
							receivedAt: "2024-01-01T00:00:00.000Z",
							rawSize: 42,
							attachments: [],
							events: [],
							forwards: [],
							replies: [],
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
	await page.unroute(EMAIL_ROUTING_SEND_ROUTE);
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
		await expect.poll(() => requestedWorkers.length).toBeGreaterThan(0);
		expect(requestedWorkers.every((worker) => worker === "worker-1")).toBe(
			true
		);
	});

	test("waits for attachments and keeps an in-flight send dialog open", async ({
		expect,
	}) => {
		await mockEmailRoutingDetail();
		await loadWorkers(1);
		let releaseSend: (() => void) | undefined;
		const sendReleased = new Promise<void>((resolve) => {
			releaseSend = resolve;
		});
		let sentBody: unknown;
		await page.route(EMAIL_ROUTING_SEND_ROUTE, async (route) => {
			sentBody = route.request().postDataJSON();
			await sendReleased;
			await route.fulfill({
				contentType: "application/json",
				body: JSON.stringify({
					errors: [],
					messages: [],
					result: { messageId: "<sent@example.com>", outcome: "ok" },
					success: true,
				}),
			});
		});
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		await page.getByRole("button", { name: "Send Test Email" }).click();
		await page.getByLabel("From").fill("sender@example.com");
		await page
			.getByRole("textbox", { name: "To", exact: true })
			.fill("recipient@example.com");
		await page.evaluate(() => {
			const arrayBuffer = File.prototype.arrayBuffer;
			File.prototype.arrayBuffer = async function () {
				await new Promise((resolve) => setTimeout(resolve, 200));
				return arrayBuffer.call(this);
			};
		});
		await page.getByLabel("Attachments").setInputFiles({
			buffer: Buffer.from("attachment body"),
			mimeType: "text/plain",
			name: "example.txt",
		});
		const sendButton = page.getByRole("button", { name: "Send Email" });
		await expect.poll(() => sendButton.isDisabled()).toBe(true);
		await page.getByText("example.txt").waitFor();
		await expect.poll(() => sendButton.isEnabled()).toBe(true);
		await sendButton.click();
		await page.keyboard.press("Escape");
		await page.getByRole("heading", { name: "Send test email" }).waitFor();
		await expect
			.poll(() => sentBody)
			.toMatchObject({
				attachments: [
					{
						content: Buffer.from("attachment body").toString("base64"),
						filename: "example.txt",
						type: "text/plain",
					},
				],
			});
		releaseSend?.();
		await expect
			.poll(() =>
				page.getByRole("heading", { name: "Send test email" }).count()
			)
			.toBe(0);
	});

	test("reports composer validation errors accessibly and rejects managed headers", async ({
		expect,
	}) => {
		await mockEmailRoutingDetail();
		await loadWorkers(1);
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		await page.getByRole("button", { name: "Send Test Email" }).click();
		await page.getByRole("heading", { name: "Send test email" }).waitFor();
		await page.getByRole("button", { name: "Send Email" }).click();
		await page
			.getByRole("alert")
			.filter({ hasText: "A sender address is required." })
			.waitFor();

		await page.getByLabel("From").fill("sender@example.com");
		await page
			.getByRole("textbox", { name: "To", exact: true })
			.fill("recipient@example.com");
		const headersInput = page.getByLabel("Custom headers", { exact: false });
		await headersInput.fill("sUbJeCt: misleading subject");
		await page.getByRole("button", { name: "Send Email" }).click();

		await expect.poll(() => page.getByRole("alert").count()).toBe(1);
		await page
			.getByRole("alert")
			.filter({ hasText: "Subject is managed by the email composer" })
			.waitFor();
		expect(await headersInput.getAttribute("aria-invalid")).toBe("true");
		expect(await headersInput.getAttribute("aria-describedby")).toBe(
			"test-email-headers-help"
		);
	});

	test("preserves the current email page after a pagination failure and retries", async ({
		expect,
	}) => {
		let failNextPage = true;
		await page.route(EMAIL_ROUTING_DETAIL_ROUTE, async (route) => {
			const cursor = new URL(route.request().url()).searchParams.get("cursor");
			if (cursor && failNextPage) {
				failNextPage = false;
				await route.fulfill({ status: 500, body: "Pagination failed" });
				return;
			}
			const pageNumber = cursor ? 2 : 1;
			await route.fulfill({
				contentType: "application/json",
				body: JSON.stringify({
					errors: [],
					messages: [],
					result: [
						{
							attachments: [],
							from: `sender-${pageNumber}@example.com`,
							messageId: `<page-${pageNumber}@example.com>`,
							rawSize: 4,
							receivedAt: "2026-08-24T00:00:00.000Z",
							subject: `Page ${pageNumber}`,
							to: "recipient@example.com",
						},
					],
					result_info: {
						count: 1,
						cursor: cursor ? undefined : "next-page",
						has_more: !cursor,
						per_page: 10,
					},
					success: true,
				}),
			});
		});
		await loadWorkers(1);
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		await page.getByText("Page 1", { exact: true }).waitFor();

		await page.getByRole("button", { name: "Next page" }).click();
		await page.getByRole("alert").waitFor();
		await page.getByText("Page 1", { exact: true }).waitFor();

		await page.getByRole("button", { name: "Next page" }).click();
		await page.getByText("Page 2", { exact: true }).waitFor();
		expect(await page.getByRole("alert").count()).toBe(0);
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
		await page.getByRole("button", { name: "Send Test Email" }).click();
		await page.getByLabel("From").waitFor();
		await page.evaluate(() => {
			const arrayBuffer = File.prototype.arrayBuffer;
			File.prototype.arrayBuffer = function () {
				document.documentElement.dataset.oversizedFileRead = "true";
				return arrayBuffer.call(this);
			};
		});
		await page.getByLabel("Attachments").setInputFiles({
			buffer: Buffer.alloc(700 * 1024 + 1),
			mimeType: "application/octet-stream",
			name: "oversized.bin",
		});
		await page.getByText(/Attachments must total less than/).waitFor();
		expect(
			await page.locator("html").getAttribute("data-oversized-file-read")
		).toBeNull();

		await page.evaluate(() => {
			const arrayBuffer = File.prototype.arrayBuffer;
			File.prototype.arrayBuffer = async function () {
				await new Promise((resolve) => setTimeout(resolve, 200));
				return arrayBuffer.call(this);
			};
		});
		const attachmentInput = page.getByLabel("Attachments");
		await attachmentInput.setInputFiles({
			buffer: Buffer.alloc(400 * 1024),
			mimeType: "application/octet-stream",
			name: "first-pending.bin",
		});
		await attachmentInput.setInputFiles({
			buffer: Buffer.alloc(400 * 1024),
			mimeType: "application/octet-stream",
			name: "second-rejected.bin",
		});
		await page.getByText(/Attachments must total less than/).waitFor();
		await page.getByText("first-pending.bin").waitFor();
		expect(await page.getByText("second-rejected.bin").count()).toBe(0);

		await page.keyboard.press("Escape");
		await page.getByRole("button", { name: "Send Test Email" }).click();
		await attachmentInput.setInputFiles({
			buffer: Buffer.alloc(400 * 1024),
			mimeType: "application/octet-stream",
			name: "cancelled-on-close.bin",
		});
		await page.keyboard.press("Escape");
		await page.waitForTimeout(250);
		await page.getByRole("button", { name: "Send Test Email" }).click();
		expect(await page.getByText("cancelled-on-close.bin").count()).toBe(0);
		await page.getByText("No attachments").waitFor();
		await page.keyboard.press("Escape");

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
	});
});
