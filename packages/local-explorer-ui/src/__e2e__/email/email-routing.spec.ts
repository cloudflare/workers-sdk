import { afterEach, describe, test } from "vitest";
import { page, viteUrl } from "../utils";
import {
	cleanupEmailMocks,
	EMAIL_ROUTING_DETAIL_ROUTE,
	EMAIL_ROUTING_SEND_ROUTE,
	fulfillApiResult,
	loadWorker,
	mockEmailRoutingDetail,
	mockEmptyEmailSending,
} from "./utils";

afterEach(async () => {
	await cleanupEmailMocks();
});

describe("email routing", () => {
	test("navigates from collapsed Email group links", async ({ expect }) => {
		await mockEmailRoutingDetail();
		await mockEmptyEmailSending();
		await loadWorker();

		const sidebar = page.locator('[data-sidebar="sidebar"]');
		if ((await sidebar.getAttribute("data-state")) !== "collapsed") {
			await page.getByRole("button", { name: "Toggle sidebar" }).click();
		}
		await expect
			.poll(() => sidebar.getAttribute("data-state"))
			.toBe("collapsed");

		const emailGroup = page.getByRole("button", {
			exact: true,
			name: "Email",
		});
		await page.locator("html").evaluate((element) => {
			element.dataset.spaNavigationMarker = "preserved";
		});
		await emailGroup.hover();
		await emailGroup.click();
		await page.getByRole("link", { name: "Routing", exact: true }).click();
		await expect
			.poll(() => new URL(page.url()).pathname)
			.toMatch(/\/email\/routing$/);
		expect(
			await page.locator("html").getAttribute("data-spa-navigation-marker")
		).toBe("preserved");

		// The popup stays open across SPA navigation. Clicking its trigger here
		// would close it while the next link is being selected.
		const sendingLink = page.getByRole("link", {
			name: "Sending",
			exact: true,
		});
		await sendingLink.waitFor();
		await sendingLink.click();
		await expect
			.poll(() => new URL(page.url()).pathname)
			.toMatch(/\/email\/sending$/);
		expect(
			await page.locator("html").getAttribute("data-spa-navigation-marker")
		).toBe("preserved");
	});

	test("waits for attachments and keeps an in-flight send dialog open", async ({
		expect,
	}) => {
		await mockEmailRoutingDetail();
		await loadWorker();
		let releaseSend: (() => void) | undefined;
		const sendReleased = new Promise<void>((resolve) => {
			releaseSend = resolve;
		});
		let sentBody: unknown;
		await page.route(EMAIL_ROUTING_SEND_ROUTE, async (route) => {
			sentBody = route.request().postDataJSON();
			await sendReleased;
			await fulfillApiResult(route, {
				messageId: "<sent@example.com>",
				outcome: "ok",
			});
		});
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		await page.getByRole("button", { name: "Send Test Email" }).click();
		await page.locator("#test-email-from").fill("sender@example.com");
		await page.locator("#test-email-to").fill("recipient@example.com");
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
		await page.getByRole("button", { name: "Edit and resend" }).click();
		await page.getByText("example.txt").waitFor();
		expect(await page.getByText("text/plain · 15 B").count()).toBe(1);
	});

	test("closes and refreshes when an email is captured without a handler", async ({
		expect,
	}) => {
		let listRequests = 0;
		await page.route(EMAIL_ROUTING_DETAIL_ROUTE, async (route) => {
			listRequests++;
			await fulfillApiResult(
				route,
				listRequests === 1
					? []
					: [
							{
								attachments: [],
								events: [
									{
										timestamp: "2026-08-27T00:00:00.000Z",
										type: "unhandled",
									},
								],
								from: "sender@example.com",
								messageId: "<captured-without-handler@example.com>",
								outcome: "exception",
								rawSize: 42,
								receivedAt: "2026-08-27T00:00:00.000Z",
								subject: "Captured without handler",
								to: "recipient@example.com",
							},
						],
				{
					resultInfo: {
						count: listRequests === 1 ? 0 : 1,
						has_more: false,
						per_page: 25,
					},
				}
			);
		});
		await loadWorker();
		await page.route(EMAIL_ROUTING_SEND_ROUTE, async (route) => {
			await route.fulfill({
				body: JSON.stringify({
					errors: [
						{
							code: 10602,
							message: "Worker 'worker-1' does not export an email() handler.",
						},
					],
					messages: [],
					result: null,
					success: false,
				}),
				contentType: "application/json",
				status: 400,
			});
		});
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		await page.getByRole("button", { name: "Send Test Email" }).click();
		await page.locator("#test-email-from").fill("sender@example.com");
		await page.locator("#test-email-to").fill("recipient@example.com");
		await page.getByLabel("Subject").fill("Captured without handler");
		await page.getByRole("button", { name: "Send Email" }).click();

		await page
			.getByText("Worker 'worker-1' does not export an email() handler.")
			.waitFor();
		await expect
			.poll(() =>
				page.getByRole("heading", { name: "Send test email" }).count()
			)
			.toBe(0);
		const emailRow = page.getByRole("button", {
			name: /Captured without handler/,
		});
		await emailRow.waitFor();
		await emailRow
			.getByRole("img", { name: "Email processing exception" })
			.waitFor();
		expect(listRequests).toBeGreaterThan(1);
	});

	test("allows large attachments and cancels pending reads", async ({
		expect,
	}) => {
		await mockEmailRoutingDetail();
		await loadWorker();
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		await page.getByRole("button", { name: "Send Test Email" }).click();
		const attachmentInput = page.getByLabel("Attachments");
		await page.evaluate(() => {
			const arrayBuffer = File.prototype.arrayBuffer;
			File.prototype.arrayBuffer = async function () {
				await new Promise((resolve) => setTimeout(resolve, 200));
				return arrayBuffer.call(this);
			};
		});
		await attachmentInput.setInputFiles({
			buffer: Buffer.from("cancelled attachment"),
			mimeType: "application/octet-stream",
			name: "cancelled-on-close.bin",
		});
		await page.keyboard.press("Escape");
		await page.waitForTimeout(250);
		await page.getByRole("button", { name: "Send Test Email" }).click();
		expect(await page.getByText("cancelled-on-close.bin").count()).toBe(0);

		await attachmentInput.setInputFiles({
			buffer: Buffer.alloc(700 * 1024 + 1),
			mimeType: "application/octet-stream",
			name: "over-legacy-limit.bin",
		});
		await page.getByText("over-legacy-limit.bin").waitFor();
		expect(
			await page.getByText(/Attachments must total less than/).count()
		).toBe(0);
	});

	test("edits and resends the last successful email with multiline headers", async ({
		expect,
	}) => {
		await mockEmailRoutingDetail(true, { showInList: true });
		await loadWorker();
		const sentBodies: Array<Record<string, unknown>> = [];
		await page.route(EMAIL_ROUTING_SEND_ROUTE, async (route) => {
			sentBodies.push(
				route.request().postDataJSON() as Record<string, unknown>
			);
			await fulfillApiResult(route, {
				messageId: `<sent-${sentBodies.length}@example.com>`,
				outcome: "ok",
			});
		});
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);

		const editAndResendButton = page.getByRole("button", {
			name: "Edit and resend",
		});
		await editAndResendButton.waitFor();
		expect(await editAndResendButton.isDisabled()).toBe(true);
		await page.getByRole("button", { name: "Send Test Email" }).click();
		await page.locator("#test-email-from").fill("sender@example.com");
		await page.locator("#test-email-to").fill("recipient@example.com");
		await page.getByLabel("Subject").fill("Original subject");
		await page.getByLabel("Text body").fill("Original body");
		await page.getByRole("button", { name: "Add header" }).click();
		const headerNameInput = page.getByLabel("Header 1 name");
		const headerValueInput = page.getByLabel("Header 1 value");
		await expect.poll(() => headerNameInput.isEditable()).toBe(true);
		await expect.poll(() => headerValueInput.isEditable()).toBe(true);
		await headerNameInput.fill("X-Multiline");
		await headerValueInput.fill("first line\nsecond line");
		expect(await headerNameInput.inputValue()).toBe("X-Multiline");
		expect(await headerValueInput.inputValue()).toBe("first line\nsecond line");
		await page.getByRole("button", { name: "Add header" }).click();
		await page.getByLabel("Header 2 name").fill("__proto__");
		await page.getByLabel("Header 2 value").fill("prototype-safe value");
		await page.getByRole("button", { name: "Send Email" }).click();

		await expect.poll(() => editAndResendButton.isEnabled()).toBe(true);
		expect(sentBodies[0]).toMatchObject({
			from: "sender@example.com",
			subject: "Original subject",
			text: "Original body",
			to: ["recipient@example.com"],
		});
		expect(sentBodies[0]?.headers).toEqual(
			Object.fromEntries([
				["X-Multiline", "first line\nsecond line"],
				["__proto__", "prototype-safe value"],
			])
		);

		await page.getByRole("button", { name: /Test email/ }).click();
		await expect
			.poll(() => new URL(page.url()).pathname)
			.toMatch(/\/email\/routing\/[^/]+$/);
		await page.getByRole("link", { name: "Routing", exact: true }).click();
		await expect
			.poll(() => new URL(page.url()).pathname)
			.toMatch(/\/email\/routing$/);
		await expect.poll(() => editAndResendButton.isEnabled()).toBe(true);

		await page.getByRole("button", { name: "Edit and resend" }).click();
		expect(await page.locator("#test-email-from").inputValue()).toBe(
			"sender@example.com"
		);
		expect(await page.getByLabel("Subject").inputValue()).toBe(
			"Original subject"
		);
		expect(await page.getByLabel("Text body").inputValue()).toBe(
			"Original body"
		);
		expect(await page.getByLabel("Header 1 name").inputValue()).toBe(
			"X-Multiline"
		);
		expect(await page.getByLabel("Header 1 value").inputValue()).toBe(
			"first line\nsecond line"
		);
		expect(await page.getByLabel("Header 2 name").inputValue()).toBe(
			"__proto__"
		);
		expect(await page.getByLabel("Header 2 value").inputValue()).toBe(
			"prototype-safe value"
		);

		await page.getByLabel("Subject").fill("Updated subject");
		await page.getByRole("button", { name: "Send Email" }).click();
		await expect.poll(() => sentBodies.length).toBe(2);
		expect(sentBodies[1]).toMatchObject({ subject: "Updated subject" });
	});

	test("reports composer validation errors accessibly and rejects managed headers", async ({
		expect,
	}) => {
		await mockEmailRoutingDetail();
		await loadWorker();
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		await page.getByRole("button", { name: "Send Test Email" }).click();
		await page.getByRole("heading", { name: "Send test email" }).waitFor();
		const fromInput = page.locator("#test-email-from");
		const toInput = page.locator("#test-email-to");
		expect(await fromInput.getAttribute("required")).not.toBeNull();
		expect(await toInput.getAttribute("required")).not.toBeNull();
		expect(
			await page.locator('label[for="test-email-from"]').textContent()
		).toContain("From *");
		expect(
			await page.locator('label[for="test-email-to"]').textContent()
		).toContain("To *");
		expect(await page.getByText("(optional)", { exact: true }).count()).toBe(0);
		await page.getByRole("button", { name: "Send Email" }).click();
		await page
			.getByText("A sender address is required.", { exact: true })
			.waitFor();
		await page
			.getByText("At least one recipient is required.", { exact: true })
			.waitFor();
		expect(await fromInput.getAttribute("aria-invalid")).toBe("true");
		expect(await toInput.getAttribute("aria-invalid")).toBe("true");
		const fromErrorId = await fromInput.getAttribute("aria-describedby");
		const toErrorId = await toInput.getAttribute("aria-describedby");
		expect(fromErrorId).toBeTruthy();
		expect(toErrorId).toBeTruthy();
		expect(await page.locator(`[id="${fromErrorId}"]`).textContent()).toContain(
			"A sender address is required."
		);
		expect(await page.locator(`[id="${toErrorId}"]`).textContent()).toContain(
			"At least one recipient is required."
		);

		await fromInput.fill("sender@example.com");
		await toInput.fill("recipient@example.com");
		expect(
			await page
				.getByText("A sender address is required.", { exact: true })
				.count()
		).toBe(0);
		expect(
			await page
				.getByText("At least one recipient is required.", { exact: true })
				.count()
		).toBe(0);
		await page.getByRole("button", { name: "Add header" }).click();
		const headersInput = page.getByLabel("Header 1 name");
		const headerValueInput = page.getByLabel("Header 1 value");
		expect(await page.getByText("Header 1", { exact: true }).count()).toBe(0);
		expect(
			await headerValueInput.evaluate(
				(element) => window.getComputedStyle(element).resize
			)
		).toBe("none");
		const dialog = page.getByRole("dialog", { name: "Send test email" });
		const dialogWidthBeforeError = await dialog.evaluate(
			(element) => element.getBoundingClientRect().width
		);
		await headersInput.fill("message-id");
		await headerValueInput.fill("custom-message-id@example.com");
		await page.getByRole("button", { name: "Send Email" }).click();

		const headersError = page.getByText(/is managed by the email composer/);
		await headersError.waitFor();
		expect(await headersError.count()).toBe(1);
		expect(
			await dialog.evaluate((element) => element.getBoundingClientRect().width)
		).toBe(dialogWidthBeforeError);
		expect(await headersInput.getAttribute("aria-invalid")).toBe("true");
		const headersErrorId = await headersInput.getAttribute("aria-describedby");
		expect(headersErrorId).toBeTruthy();
		expect(await page.locator(`[id="${headersErrorId}"]`).textContent()).toBe(
			"message-id is managed by the email composer and cannot be overridden."
		);
		await headersInput.fill("X-Custom-Header");
		expect(await headersError.count()).toBe(0);
		expect(await headersInput.getAttribute("aria-invalid")).toBeNull();
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
			await fulfillApiResult(
				route,
				[
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
				{
					resultInfo: {
						count: 1,
						cursor: cursor ? undefined : "next-page",
						has_more: !cursor,
						per_page: 10,
					},
				}
			);
		});
		await loadWorker();
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

	test("explains the email handler requirement and toggles received raw content", async ({
		expect,
	}) => {
		await mockEmailRoutingDetail(false);
		await loadWorker();
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		await page
			.getByText(
				/Email capture only works when the selected Worker has an email\(\) handler configured\./
			)
			.waitFor();

		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing/test-email-id?worker=worker-1",
				viteUrl
			).toString()
		);
		const contentButton = page.getByRole("button", { name: /^Content/ });
		expect(await contentButton.getAttribute("aria-expanded")).toBe("false");
		await contentButton.click();
		const htmlButton = page.getByRole("button", {
			name: "Preview",
			exact: true,
		});
		const rawButton = page.getByRole("button", {
			name: "HTML source",
			exact: true,
		});
		await htmlButton.waitFor();
		expect(await htmlButton.getAttribute("aria-pressed")).toBe("true");
		expect(await rawButton.getAttribute("aria-pressed")).toBe("false");
		await page
			.locator('iframe[title="Rendered received HTML email body"]')
			.waitFor();

		const headersButton = page.getByRole("button", {
			name: /Email headers/,
		});
		expect(await headersButton.textContent()).toContain("1 header");
		expect(await headersButton.getAttribute("aria-expanded")).toBe("false");
		expect(await page.getByText("X-Test-Header", { exact: true }).count()).toBe(
			0
		);
		await headersButton.click();
		expect(await headersButton.getAttribute("aria-expanded")).toBe("true");
		const headersPanel = page.getByTestId("received-email-headers-panel");
		await headersPanel.getByText("X-Test-Header", { exact: true }).waitFor();
		for (const structuredHeader of ["From", "Message-ID", "Subject", "To"]) {
			expect(
				await headersPanel.getByText(structuredHeader, { exact: true }).count()
			).toBe(0);
		}
		const multilineHeaderValue = headersPanel
			.locator("dd")
			.filter({ hasText: "first line" });
		await multilineHeaderValue.waitFor();
		expect(await multilineHeaderValue.textContent()).toBe(
			"first line\nsecond line"
		);
		await page.getByText("test-email-id", { exact: true }).waitFor();
		expect(
			await page.getByText("<test-email-id>", { exact: true }).count()
		).toBe(0);

		await rawButton.click();
		expect(await htmlButton.getAttribute("aria-pressed")).toBe("false");
		expect(await rawButton.getAttribute("aria-pressed")).toBe("true");
		await page
			.locator("pre")
			.filter({
				hasText: "<p>Rendered received HTML body</p>",
			})
			.waitFor();
		const contentPanel = page.getByTestId("received-email-content-panel");
		await contentPanel.getByRole("heading", { name: "Raw MIME" }).waitFor();
		await contentPanel.getByText(/Content-Type: text\/plain/).waitFor();
		expect(
			await page
				.locator('iframe[title="Rendered received HTML email body"]')
				.count()
		).toBe(0);
	});

	test("shows handler exceptions and truncated replies as message diagnostics", async () => {
		await mockEmailRoutingDetail(false, {
			handlerException: true,
			replyTruncated: true,
		});
		await loadWorker();
		await page.goto(
			new URL(
				"/cdn-cgi/local/explorer/email/routing?worker=worker-1",
				viteUrl
			).toString()
		);
		const emailRow = page.getByRole("button", { name: /Test email/ });
		await emailRow
			.getByRole("img", { name: "Email processing exception" })
			.waitFor();
		await emailRow.click();

		await page
			.getByRole("alert")
			.getByText(/email\(\) handler threw an exception/)
			.waitFor();
		await page
			.getByText(/Reply content was truncated during local capture/)
			.waitFor();
	});
});
