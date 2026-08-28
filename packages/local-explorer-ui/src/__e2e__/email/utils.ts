import { page, viteUrl } from "../utils";
import type { Route } from "playwright-chromium";

export const WORKERS_ROUTE = "**/cdn-cgi/local/explorer/api/local/workers";
export const EMAIL_ROUTING_DETAIL_ROUTE =
	"**/cdn-cgi/local/explorer/api/local/email/routing?*";
export const EMAIL_ROUTING_SEND_ROUTE =
	"**/cdn-cgi/local/explorer/api/local/email/routing/send?*";
export const EMAIL_SENDING_ROUTE =
	"**/cdn-cgi/local/explorer/api/local/email/sending?*";
export const EMAIL_PREVIEW_REMOTE_ROUTE = "https://email-preview.invalid/**";

interface ApiResponseOptions {
	messages?: Array<{ code: number; message: string }>;
	resultInfo?: Record<string, unknown>;
}

interface MockSentEmailOptions {
	html: string;
}

interface MockRoutingEmailOptions {
	handlerException?: boolean;
	showInList?: boolean;
	replyTruncated?: boolean;
}

interface Worker {
	bindings?: Record<string, unknown>;
	isSelf: boolean;
	name: string;
}

async function mockWorkers(workers: Worker[]): Promise<void> {
	await page.route(WORKERS_ROUTE, async (route) => {
		await fulfillApiResult(route, workers);
	});
}

/** Fulfils a mocked Local Explorer API request with the standard envelope. */
export async function fulfillApiResult(
	route: Route,
	result: unknown,
	options: ApiResponseOptions = {}
): Promise<void> {
	await route.fulfill({
		contentType: "application/json",
		body: JSON.stringify({
			errors: [],
			messages: options.messages ?? [],
			result,
			result_info: options.resultInfo,
			success: true,
		}),
	});
}

/** Mocks the worker list and loads the Local Explorer application. */
export async function loadWorker(
	workers: Worker[] = [{ isSelf: true, name: "worker-1" }]
): Promise<void> {
	await mockWorkers(workers);
	await page.goto(viteUrl);
}

/** Mocks the received-email list/detail endpoint used by routing tests. */
export async function mockEmailRoutingDetail(
	truncated = true,
	options: MockRoutingEmailOptions = {}
): Promise<void> {
	await page.route(EMAIL_ROUTING_DETAIL_ROUTE, async (route) => {
		const emailId = new URL(route.request().url()).searchParams.get("email_id");
		const messages = emailId
			? [
					...(truncated
						? [
								{
									code: 10604,
									message:
										"Displayed received email content was truncated during local capture. The complete message was still delivered to the Worker.",
								},
							]
						: []),
					...(options.replyTruncated
						? [
								{
									code: 10604,
									message:
										"Displayed reply content was truncated during local capture. The complete reply is available in the local filesystem; see the development log for its path.",
								},
							]
						: []),
				]
			: [];
		const summary = {
			attachments: [],
			events: options.handlerException
				? [
						{
							timestamp: "2024-01-01T00:00:00.000Z",
							type: "received",
						},
					]
				: [],
			forwards: [],
			from: "sender@example.com",
			messageId: "<test-email-id>",
			outcome: options.handlerException ? "exception" : "ok",
			rawSize: 42,
			receivedAt: "2024-01-01T00:00:00.000Z",
			replies: [],
			subject: "Test email",
			to: "recipient@example.com",
		};
		const result = emailId
			? {
					...summary,
					headers: {
						From: "sender@example.com",
						"Message-ID": "<test-email-id>",
						Subject: "Test email",
						To: "recipient@example.com",
						"X-Test-Header": "first line\nsecond line",
					},
					headerEntries: [
						["From", "sender@example.com"],
						["Message-ID", "<test-email-id>"],
						["Subject", "Test email"],
						["To", "recipient@example.com"],
						["X-Test-Header", "first line\nsecond line"],
					],
					html: "<p>Rendered received HTML body</p>",
					raw: "Content-Type: text/plain\r\n\r\nPlain received text body",
					text: "Plain received text body",
				}
			: options.handlerException || options.showInList
				? [summary]
				: [];
		await fulfillApiResult(route, result, {
			messages,
			resultInfo: emailId
				? undefined
				: {
						count: Array.isArray(result) ? result.length : 0,
						has_more: false,
						per_page: 25,
					},
		});
	});
}

/** Mocks an empty sent-email list for navigation tests. */
export async function mockEmptyEmailSending(): Promise<void> {
	await page.route(EMAIL_SENDING_ROUTE, async (route) => {
		await fulfillApiResult(route, [], {
			resultInfo: { count: 0, has_more: false, per_page: 25 },
		});
	});
}

/** Mocks the sent-email list/detail flow and exposes its mutable test state. */
export async function mockSentEmail({ html }: MockSentEmailOptions): Promise<{
	requestedWorkers: Array<string | null>;
	showFullDetail: () => void;
}> {
	const requestedWorkers: Array<string | null> = [];
	let detailTruncated = true;
	await mockWorkers([
		{
			bindings: { sendEmail: [{ bindingName: "SEND_EMAIL" }] },
			isSelf: true,
			name: "worker-1",
		},
		{ bindings: {}, isSelf: false, name: "worker-2" },
	]);
	await page.route(EMAIL_SENDING_ROUTE, async (route) => {
		const search = new URL(route.request().url()).searchParams;
		const emailId = search.get("email_id");
		requestedWorkers.push(search.get("worker"));
		const summary = {
			attachments: [],
			from: "<sender@example.com>",
			headers: {
				"Content-Type": "text/plain; charset=utf-8",
				"X-Custom-Header": "custom value",
			},
			messageId: "<sent-email-id>",
			sentAt: "2026-08-21T12:00:00.000Z",
			subject: "Sent email subject",
			to: ["<recipient@example.com>"],
			worker: "worker-1",
		};
		await fulfillApiResult(
			route,
			emailId
				? {
						...summary,
						html,
						rawBase64: Buffer.from(
							`From: sender@example.com\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${html}`
						).toString("base64"),
						text: `Plain text body ${"x".repeat(300)}`,
					}
				: [summary],
			{
				messages:
					emailId && detailTruncated
						? [
								{
									code: 10604,
									message:
										"Displayed sent email content was truncated during local capture. The complete email is available in the local filesystem; see the development log for its path.",
								},
							]
						: [],
				resultInfo: emailId
					? undefined
					: { count: 1, has_more: false, per_page: 25 },
			}
		);
	});
	return {
		requestedWorkers,
		showFullDetail: () => {
			detailTruncated = false;
		},
	};
}

/** Removes all email-specific request handlers registered by a test. */
export async function cleanupEmailMocks(): Promise<void> {
	await Promise.all([
		page.unroute(WORKERS_ROUTE),
		page.unroute(EMAIL_ROUTING_DETAIL_ROUTE),
		page.unroute(EMAIL_ROUTING_SEND_ROUTE),
		page.unroute(EMAIL_SENDING_ROUTE),
		page.unroute(EMAIL_PREVIEW_REMOTE_ROUTE),
	]);
}
