import { Buffer } from "node:buffer";
import { mkdtempSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { getWorkerRegistry, LogLevel, Miniflare } from "miniflare";
import dedent from "ts-dedent";
import {
	afterAll,
	beforeAll,
	describe,
	test,
	type ExpectStatic,
	vi,
} from "vitest";
import { z } from "zod";
import { CoreBindings, CorePaths } from "../../../src/workers/core/constants";
import {
	jsonByteLength,
	MAX_EMAIL_BODY_BYTES,
	MAX_EMAIL_ROW_VALUE_BYTES,
	MAX_PRODUCTION_EMAIL_BYTES,
} from "../../../src/workers/email/capture";
import {
	zEmailRoutingDetail,
	zEmailSendingDetail,
	zEmailListRoutingResponse,
	zEmailListSendingResponse,
	zWorkersApiResponseCommon,
	zWorkersApiResponseCommonFailure,
} from "../../../src/workers/local-explorer/generated/zod.gen";
import {
	disposeWithRetry,
	singleModuleManifest,
	TestLog,
	waitForWorkersInRegistry,
} from "../../test-shared";
import { expectValidResponse } from "./helpers";
import type { EmailStoreService } from "../../../src/workers/email/storage";
import type { MiniflareOptions } from "miniflare";

const BASE_URL = `http://localhost${CorePaths.EXPLORER}/api`;
const WORKER_NAME = "email-worker";
const UNICODE_WORKER_NAME = "email-a-\u{1f48c}";
const zEmailRoutingDetailResponse = zWorkersApiResponseCommon.and(
	z.object({ result: zEmailRoutingDetail })
);
const zEmailSendingDetailResponse = zWorkersApiResponseCommon.and(
	z.object({ result: zEmailSendingDetail })
);

function getListResult<T>(result: T[] | T | undefined): T[] {
	if (!Array.isArray(result)) {
		throw new Error("Expected a list response");
	}
	return result;
}

type TestEmailCursorState = Record<string, string | null>;
type TestEmailCursorResource = "routing" | "sending";

function encodeTestAggregateCursor(
	sources: TestEmailCursorState,
	resource: TestEmailCursorResource = "routing",
	worker?: string
): string {
	return `a.${Buffer.from(
		JSON.stringify({ resource, worker, sources })
	).toString("base64")}`;
}

function decodeTestAggregateCursor(cursor: string): TestEmailCursorState {
	const envelope = JSON.parse(
		Buffer.from(cursor.slice(2), "base64").toString()
	) as { sources: TestEmailCursorState };
	return envelope.sources;
}

async function dispatchExplorerApi(
	instance: Miniflare,
	path: string,
	init?: RequestInit
): Promise<Response> {
	return instance.dispatchFetch(`${BASE_URL}${path}`, init);
}

async function clearEmailStore(instance: Miniflare): Promise<void> {
	const store = (await instance._getProxyClient()).env[
		CoreBindings.SERVICE_EMAIL_STORE
	] as unknown as EmailStoreService;
	await store.clear();
}

async function storeSentEmail(
	instance: Miniflare,
	email: {
		worker: string;
		messageId: string;
		sentAt: string;
	}
): Promise<void> {
	const store = (await instance._getProxyClient()).env[
		CoreBindings.SERVICE_EMAIL_STORE
	] as unknown as EmailStoreService;
	await store.storeSent({
		...email,
		from: "sender@example.com",
		to: ["recipient@example.com"],
		subject: email.messageId,
		attachments: [],
	});
}

async function storeReceivedEmail(
	instance: Miniflare,
	email: {
		worker: string;
		messageId: string;
		subject: string;
		receivedAt?: string;
		text?: string;
	}
): Promise<void> {
	const store = (await instance._getProxyClient()).env[
		CoreBindings.SERVICE_EMAIL_STORE
	] as unknown as EmailStoreService;
	const captureId = crypto.randomUUID();
	const raw = [
		"From: sender@example.com",
		"To: recipient@example.com",
		`Message-ID: ${email.messageId}`,
		`Subject: ${email.subject}`,
		"Content-Type: text/plain",
		"",
		email.text ?? email.subject,
	].join("\r\n");
	await store.storeReceivedBody(
		captureId,
		0,
		Buffer.from(raw).toString("base64")
	);
	await store.storeReceivedMetadata(captureId, 1, {
		worker: email.worker,
		messageId: email.messageId,
		from: "sender@example.com",
		to: "recipient@example.com",
		subject: email.subject,
		headers: {
			from: "sender@example.com",
			to: "recipient@example.com",
			"message-id": email.messageId,
			subject: email.subject,
			"content-type": "text/plain",
		},
		attachments: [],
		rawSize: Buffer.byteLength(raw),
		receivedAt: email.receivedAt ?? new Date().toISOString(),
		outcome: "ok",
		forwards: [],
		replies: [],
		events: [{ type: "received", timestamp: new Date().toISOString() }],
	});
}

async function expectExplorerApiResponse<TSchema extends z.ZodType>(
	instance: Miniflare,
	path: string,
	schema: TSchema,
	expect: ExpectStatic,
	status?: number
): Promise<z.output<TSchema>> {
	return expectValidResponse(
		await dispatchExplorerApi(instance, path),
		schema,
		expect,
		status
	);
}

async function sendRoutingTestEmail(
	instance: Miniflare,
	worker: string,
	email: {
		messageId: string;
		subject: string;
		text: string;
		from?: string;
		to?: string[];
	},
	expect: ExpectStatic
): Promise<string> {
	const response = await dispatchExplorerApi(
		instance,
		`/local/email/routing/send?worker=${encodeURIComponent(worker)}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				from: email.from ?? "sender@example.com",
				to: email.to ?? ["recipient@example.com"],
				subject: email.subject,
				text: email.text,
				headers: { "Message-ID": email.messageId },
			}),
		}
	);
	expect(response.status).toBe(200);
	const result = (await response.json()) as {
		result?: { messageId?: string };
	};
	const messageId = result.result?.messageId;
	if (messageId === undefined) {
		throw new Error("Expected send test email to return a Message-ID");
	}
	return messageId;
}

const EMAIL_WORKER = dedent /* javascript */ `
	import { EmailMessage } from "cloudflare:email";

	export default {
		async fetch(request, env) {
				const url = new URL(request.url);
				if (url.pathname === "/send-raw") {
					using message = await env.SEND_EMAIL.send(new EmailMessage(
						url.searchParams.get("from"),
						url.searchParams.get("to"),
						request.body
					));
					return Response.json(message);
				}

				if (url.pathname === "/send-builder") {
					using message = await env.SEND_EMAIL.send(await request.json());
					return Response.json(message);
				}

			return new Response("ok");
		},

		async email(message) {
			const mode = message.headers.get("x-test-mode");
			if (mode === "assert-large-body") {
				const delivered = await new Response(message.raw).arrayBuffer();
				if (delivered.byteLength <= 1024 * 1024) {
					throw new Error("Expected the full email body to be delivered");
				}
				} else if (mode === "assert-raw-size") {
					const delivered = await new Response(message.raw).arrayBuffer();
					const expected = Number(message.headers.get("x-expected-raw-size"));
					if (delivered.byteLength !== expected) {
						throw new Error(
							"Expected " + expected + " bytes, received " + delivered.byteLength
						);
					}
				} else if (mode === "assert-no-bcc") {
					const delivered = await new Response(message.raw).text();
					const bcc = message.headers.get("bcc");
					if (bcc != null) {
						message.setReject("Recipient headers included Bcc: " + String(bcc));
					} else if (/^bcc:/imu.test(delivered)) {
						message.setReject("Recipient raw MIME included Bcc");
					}
				} else if (mode === "forward") {
					using result = await message.forward("forwarded@example.com");
				} else if (mode === "reply") {
					const incomingMessageId = message.headers.get("message-id");
					using result = await message.reply(
						new EmailMessage(
							"reply@example.com",
							message.from,
							"From: reply@example.com\\n" +
							"To: sender@example.com\\n" +
							"Subject: =?UTF-8?B?UmVwbHkgc3ViamVjdA==?=\\n" +
							"In-Reply-To: " + incomingMessageId + "\\n" +
							"Message-ID: <reply@example.com>\\n" +
							"MIME-Version: 1.0\\n" +
							"Content-Type: text/plain\\n\\n" +
						"Body literal =?UTF-8?B?U2hvdWxkIHN0YXkgcmF3?="
						)
					);
				} else if (mode === "reply-large") {
					const incomingMessageId = message.headers.get("message-id");
					const replyPrefix =
						"From: reply@example.com\\n" +
						"To: sender@example.com\\n" +
						"Subject: Large reply\\n" +
						"In-Reply-To: " + incomingMessageId + "\\n" +
						"References: " + incomingMessageId + "\\n" +
						"Message-ID: <large-reply@example.com>\\n" +
						"MIME-Version: 1.0\\n" +
						"Content-Type: text/plain\\n\\n";
					const filler = "z".repeat(
						${MAX_EMAIL_BODY_BYTES} -
							new TextEncoder().encode(replyPrefix).byteLength -
							1
					);
					using result = await message.reply(
						new EmailMessage(
							"reply@example.com",
							message.from,
							replyPrefix + filler + "€complete reply"
						)
					);
				} else if (mode === "reply-many") {
					const incomingMessageId = message.headers.get("message-id");
					const filler = "m".repeat(2 * 1024 * 1024);
					for (let i = 0; i < 3; i++) {
						using result = await message.reply(
						new EmailMessage(
							"reply@example.com",
							message.from,
								"From: reply@example.com\\n" +
								"To: sender@example.com\\n" +
								"Subject: Reply " + i + "\\n" +
								"In-Reply-To: " + incomingMessageId + "\\n" +
								"Message-ID: <reply-" + i + "@example.com>\\n" +
								"MIME-Version: 1.0\\n" +
								"Content-Type: text/plain\\n\\n" +
								filler
							)
						);
					}
			} else if (mode === "reject") {
				message.setReject("Rejected by test worker");
			}
		},
	};
`;

function emailPeerOptions(
	registryPath: string,
	names: string | string[],
	register: boolean
): MiniflareOptions {
	const workerNames = Array.isArray(names) ? names : [names];
	return {
		inspectorPort: 0,
		unsafeLocalExplorer: true,
		unsafeTriggerHandlers: true,
		unsafeDevRegistryPath: registryPath,
		workers: workerNames.map((name) => ({
			dev: { unsafeRegisterWorker: register },
			config: {
				type: "worker",
				name,
				compatibilityDate: "2025-03-17",
				manifest: singleModuleManifest(EMAIL_WORKER),
				env: {
					SEND_EMAIL: { type: "send-email" },
				},
			},
		})),
	};
}

const NO_EMAIL_HANDLER_WORKER_NAME = "no-email-handler-worker";
const NO_EMAIL_HANDLER_WORKER = dedent /* javascript */ `
	export default {
		async fetch(request, env) {
			return new Response("ok");
		},
	};
`;

describe("Local Explorer email API", () => {
	let mf: Miniflare;
	const log = new TestLog();

	beforeAll(async () => {
		mf = new Miniflare({
			inspectorPort: 0,
			log,
			unsafeLocalExplorer: true,
			unsafeTriggerHandlers: true,
			workers: [
				{
					config: {
						type: "worker",
						name: WORKER_NAME,
						compatibilityDate: "2025-03-17",
						manifest: singleModuleManifest(EMAIL_WORKER),
						env: {
							SEND_EMAIL: { type: "send-email" },
						},
					},
				},
				{
					config: {
						type: "worker",
						name: NO_EMAIL_HANDLER_WORKER_NAME,
						compatibilityDate: "2025-03-17",
						manifest: singleModuleManifest(NO_EMAIL_HANDLER_WORKER),
					},
				},
			],
		});
		await mf.ready;
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	test("captures a sent EmailMessage with raw content", async ({ expect }) => {
		const raw = dedent`
			From: sender@example.com
			To: recipient@example.com
			Message-ID: <sent-raw@example.com>
			Subject: Raw message
			MIME-Version: 1.0
			Content-Type: text/plain

			Raw message body.
		`;

		const sendResponse = await mf.dispatchFetch(
			"http://localhost/send-raw?" +
				new URLSearchParams({
					from: "sender@example.com",
					to: "recipient@example.com",
				}).toString(),
			{
				method: "POST",
				body: raw,
			}
		);

		expect(sendResponse.status).toBe(200);
		const sentResult = (await sendResponse.json()) as { messageId: string };
		expect(sentResult).toEqual({
			messageId: expect.stringMatching(/^<[A-Za-z0-9]{36}@example\.com>$/),
		});
		const sentMessageId = sentResult.messageId;

		const listResponse = await mf.dispatchFetch(
			`${BASE_URL}/local/email/sending`
		);
		const list = await expectValidResponse(
			listResponse,
			zEmailListSendingResponse,
			expect
		);
		const item = getListResult(list.result).find(
			(email) => email.messageId === sentMessageId
		);
		expect(item).toMatchObject({
			worker: WORKER_NAME,
			from: "sender@example.com",
			to: ["recipient@example.com"],
			subject: "Raw message",
		});
		expect(item).not.toHaveProperty("raw");

		const detailResponse = await mf.dispatchFetch(
			`${BASE_URL}/local/email/sending?email_id=${encodeURIComponent(sentMessageId)}`
		);
		const detail = await expectValidResponse(
			detailResponse,
			zEmailSendingDetailResponse,
			expect
		);
		const normalizedRaw = raw.replace(
			"Message-ID: <sent-raw@example.com>",
			`Message-ID: ${sentMessageId}`
		);
		expect(detail.result).toMatchObject({
			worker: WORKER_NAME,
			messageId: sentMessageId,
			headers: expect.objectContaining({ "message-id": sentMessageId }),
			raw: normalizedRaw,
			rawBase64: Buffer.from(normalizedRaw).toString("base64"),
		});
	});

	test("captures a MessageBuilder and omits large fields from list results", async ({
		expect,
	}) => {
		const sendResponse = await mf.dispatchFetch(
			"http://localhost/send-builder",
			{
				method: "POST",
				body: JSON.stringify({
					from: { name: "Sender", email: "sender@example.com" },
					to: "recipient@example.com",
					subject: "Builder message",
					text: "Plain text",
					html: "<p>HTML</p>",
					headers: { "Message-ID": "<sent-builder@example.com>" },
					attachments: [
						{
							filename: "hello.txt",
							type: "text/plain",
							disposition: "attachment",
							content: "SGVsbG8=",
						},
					],
				}),
			}
		);

		expect(sendResponse.status).toBe(200);
		const sentResult = (await sendResponse.json()) as { messageId: string };
		expect(sentResult).toEqual({
			messageId: expect.stringMatching(/^<[A-Za-z0-9]{36}@example\.com>$/),
		});
		const sentMessageId = sentResult.messageId;

		const list = await expectValidResponse(
			await mf.dispatchFetch(`${BASE_URL}/local/email/sending`),
			zEmailListSendingResponse,
			expect
		);
		const item = getListResult(list.result).find(
			(email) => email.messageId === sentMessageId
		);
		expect(item).toMatchObject({
			worker: WORKER_NAME,
			from: '"Sender" <sender@example.com>',
			to: ["recipient@example.com"],
			subject: "Builder message",
			attachments: [
				{
					filename: "hello.txt",
					contentType: "text/plain",
					disposition: "attachment",
					size: 8,
				},
			],
		});
		expect(item).not.toHaveProperty("text");
		expect(item).not.toHaveProperty("html");

		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/sending?email_id=${encodeURIComponent(sentMessageId)}`
			),
			zEmailSendingDetailResponse,
			expect
		);
		expect(detail.result).toMatchObject({
			text: "Plain text",
			html: "<p>HTML</p>",
		});
	});

	test("captures a MessageBuilder attachment that omits its disposition", async ({
		expect,
	}) => {
		// An attachment may leave `disposition` unset. Without a default the
		// captured record stores `undefined`, which fails schema validation and
		// breaks the entire sent list (and stops further capture once eviction
		// begins). The default must match `buildMimeMessage` ("attachment").
		const sendResponse = await mf.dispatchFetch(
			"http://localhost/send-builder",
			{
				method: "POST",
				body: JSON.stringify({
					from: "sender@example.com",
					to: "recipient@example.com",
					subject: "Attachment without disposition",
					text: "Body",
					headers: { "Message-ID": "<sent-no-disposition@example.com>" },
					attachments: [
						{
							filename: "hello.txt",
							type: "text/plain",
							content: "SGVsbG8=",
						},
					],
				}),
			}
		);

		expect(sendResponse.status).toBe(200);
		const sentResult = (await sendResponse.json()) as { messageId: string };
		const sentMessageId = sentResult.messageId;

		// The sent list must still load and validate against the schema.
		const list = await expectValidResponse(
			await mf.dispatchFetch(`${BASE_URL}/local/email/sending`),
			zEmailListSendingResponse,
			expect
		);
		const item = getListResult(list.result).find(
			(email) => email.messageId === sentMessageId
		);
		expect(item).toMatchObject({
			subject: "Attachment without disposition",
			attachments: [
				{
					filename: "hello.txt",
					contentType: "text/plain",
					disposition: "attachment",
					size: 8,
				},
			],
		});
	});

	test("sends an EmailMessage at the production limit and captures a truncated copy", async ({
		expect,
	}) => {
		const warningCount = log.logsAtLevel(LogLevel.WARN).length;
		const headers =
			[
				"From: sender@example.com",
				"To: recipient@example.com",
				"Message-ID: <sent-large-raw@example.com>",
				"Subject: Large raw message",
				"MIME-Version: 1.0",
				"Content-Type: text/plain",
				"",
			].join("\r\n") + "\r\n";
		const headerBytes = new TextEncoder().encode(headers).byteLength;
		const bodyBytes = MAX_PRODUCTION_EMAIL_BYTES - headerBytes;
		const raw =
			headers +
			"\u{1f4e7}".repeat(Math.floor(bodyBytes / 4)) +
			"x".repeat(bodyBytes % 4);
		expect(new TextEncoder().encode(raw).byteLength).toBe(
			MAX_PRODUCTION_EMAIL_BYTES
		);

		const sendResponse = await mf.dispatchFetch(
			"http://localhost/send-raw?" +
				new URLSearchParams({
					from: "sender@example.com",
					to: "recipient@example.com",
				}).toString(),
			{ method: "POST", body: raw }
		);

		expect(sendResponse.status).toBe(200);
		const sentResult = (await sendResponse.json()) as { messageId: string };
		expect(sentResult.messageId).toMatch(/^<[A-Za-z0-9]{36}@example\.com>$/);

		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/sending?email_id=${encodeURIComponent(sentResult.messageId)}`
			),
			zEmailSendingDetailResponse,
			expect
		);
		expect(detail.result?.subject).toBe("Large raw message");
		expect(detail.messages).toEqual([
			{
				code: 10604,
				message:
					"Displayed sent email content was truncated during local capture. The complete email is available in the local filesystem; see the development log for its path.",
			},
		]);
		const capturedBytes = Buffer.from(
			String(detail.result?.rawBase64),
			"base64"
		).byteLength;
		expect(capturedBytes).toBeGreaterThan(1024 * 1024);
		expect(capturedBytes).toBeLessThan(
			new TextEncoder().encode(raw).byteLength
		);
		expect(String(detail.result?.rawBase64).length).toBeLessThanOrEqual(
			MAX_EMAIL_ROW_VALUE_BYTES
		);
		expect(detail.result?.raw).not.toContain("\uFFFD");
		expect(
			log.logsAtLevel(LogLevel.WARN).slice(warningCount)
		).not.toContainEqual(expect.stringContaining("local storage row"));
	});

	test("sends a production-limit MessageBuilder and captures a truncated copy", async ({
		expect,
	}) => {
		const warningCount = log.logsAtLevel(LogLevel.WARN).length;
		const text = "y".repeat(MAX_PRODUCTION_EMAIL_BYTES);
		const sendResponse = await mf.dispatchFetch(
			"http://localhost/send-builder",
			{
				method: "POST",
				body: JSON.stringify({
					from: "sender@example.com",
					to: "recipient@example.com",
					subject: "Large builder message",
					text,
					headers: { "Message-ID": "<sent-large-builder@example.com>" },
				}),
			}
		);

		expect(sendResponse.status).toBe(200);
		const sentResult = (await sendResponse.json()) as { messageId: string };
		expect(sentResult.messageId).toMatch(/^<[A-Za-z0-9]{36}@example\.com>$/);

		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/sending?email_id=${encodeURIComponent(sentResult.messageId)}`
			),
			zEmailSendingDetailResponse,
			expect
		);
		expect(detail.result?.subject).toBe("Large builder message");
		expect(detail.messages).toEqual([
			{
				code: 10604,
				message:
					"Displayed sent email content was truncated during local capture. The complete email is available in the local filesystem; see the development log for its path.",
			},
		]);
		const capturedTextBytes = new TextEncoder().encode(
			detail.result?.text ?? ""
		).byteLength;
		expect(capturedTextBytes).toBeGreaterThan(1024 * 1024);
		expect(capturedTextBytes).toBeLessThan(
			new TextEncoder().encode(text).byteLength
		);
		expect(jsonByteLength(detail.result)).toBeLessThanOrEqual(
			MAX_EMAIL_ROW_VALUE_BYTES
		);
		expect(
			log.logsAtLevel(LogLevel.WARN).slice(warningCount)
		).not.toContainEqual(expect.stringContaining("local storage row"));
	});

	test("captures a MessageBuilder with large text, html, and headers", async ({
		expect,
	}) => {
		const largeHeader = "z".repeat(768 * 1024);
		const sendResponse = await mf.dispatchFetch(
			"http://localhost/send-builder",
			{
				method: "POST",
				body: JSON.stringify({
					from: "sender@example.com",
					to: "recipient@example.com",
					subject: "Large text and html",
					text: "t".repeat(2 * 1024 * 1024),
					html: "h".repeat(2 * 1024 * 1024),
					headers: {
						"Message-ID": "<sent-large-text-html@example.com>",
						"X-Large-Header": largeHeader,
					},
				}),
			}
		);

		expect(sendResponse.status).toBe(200);
		const sentResult = (await sendResponse.json()) as { messageId: string };

		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/sending?email_id=${encodeURIComponent(sentResult.messageId)}`
			),
			zEmailSendingDetailResponse,
			expect
		);
		expect(detail.result).toMatchObject({
			subject: "Large text and html",
			headers: {
				"Message-ID": "<sent-large-text-html@example.com>",
				"X-Large-Header": largeHeader,
			},
		});
		const textBytes = new TextEncoder().encode(
			detail.result?.text ?? ""
		).byteLength;
		const htmlBytes = new TextEncoder().encode(
			detail.result?.html ?? ""
		).byteLength;
		expect(textBytes).toBeGreaterThan(0);
		expect(htmlBytes).toBe(0);
		expect(jsonByteLength(detail.result)).toBeLessThanOrEqual(
			MAX_EMAIL_ROW_VALUE_BYTES
		);
	});

	test("keeps sending when metadata cannot fit in the capture row", async ({
		expect,
	}) => {
		const warningCount = log.logsAtLevel(LogLevel.WARN).length;
		const sendResponse = await mf.dispatchFetch(
			"http://localhost/send-builder",
			{
				method: "POST",
				body: JSON.stringify({
					from: "sender@example.com",
					to: "recipient@example.com",
					subject: "Metadata overflow",
					text: "Delivered despite capture failure.",
					headers: {
						"X-Large-Header": "z".repeat(MAX_EMAIL_ROW_VALUE_BYTES),
					},
				}),
			}
		);

		expect(sendResponse.status).toBe(200);
		const sentResult = (await sendResponse.json()) as { messageId: string };

		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/sending?email_id=${encodeURIComponent(sentResult.messageId)}`
			),
			zWorkersApiResponseCommonFailure,
			expect,
			404
		);
		expect(detail.result).toBeNull();

		await vi.waitFor(() => {
			expect(log.logsAtLevel(LogLevel.WARN).slice(warningCount)).toContain(
				"Failed to capture sent email for the Local Explorer; the email was still sent."
			);
		});
	});

	test("keeps delivering when received metadata cannot fit in the capture row", async ({
		expect,
	}) => {
		const warningCount = log.logsAtLevel(LogLevel.WARN).length;
		const messageId = "<received-metadata-overflow@example.com>";
		const raw =
			[
				"From: sender@example.com",
				"To: recipient@example.com",
				`Message-ID: ${messageId}`,
				"Subject: Received metadata overflow",
				`X-Large-Header: ${"z".repeat(MAX_EMAIL_ROW_VALUE_BYTES)}`,
				"MIME-Version: 1.0",
				"Content-Type: text/plain",
				"",
				"Delivered despite capture failure.",
			].join("\r\n") + "\r\n";

		const response = await mf.dispatchFetch(
			"http://localhost/cdn-cgi/local/email?" +
				new URLSearchParams({
					from: "sender@example.com",
					to: "recipient@example.com",
					format: "json",
				}).toString(),
			{ method: "POST", body: raw }
		);

		const responseBody = await response.text();
		expect(response.status, responseBody).toBe(200);
		expect(JSON.parse(responseBody)).toMatchObject({ outcome: "ok" });

		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/routing?email_id=${encodeURIComponent(messageId)}`
			),
			zWorkersApiResponseCommonFailure,
			expect,
			404
		);
		expect(detail.result).toBeNull();

		await vi.waitFor(() => {
			expect(log.logsAtLevel(LogLevel.WARN).slice(warningCount)).toContainEqual(
				expect.stringContaining(
					"Failed to capture received email for the Local Explorer; the email was still delivered. Cause:"
				)
			);
		});
	});

	test("captures a >1 MiB received email and reply as truncated copies", async ({
		expect,
	}) => {
		const warningCount = log.logsAtLevel(LogLevel.WARN).length;
		const headers =
			dedent`
				From: sender@example.com
				To: recipient@example.com
				Message-ID: <received-large-reply@example.com>
				X-Test-Mode: reply-large
				MIME-Version: 1.0
				Content-Type: text/plain
			` + "\r\n\r\n";
		const headerBytes = new TextEncoder().encode(headers).byteLength;
		const raw = headers + "x".repeat(2 * 1024 * 1024 - headerBytes);
		const response = await mf.dispatchFetch(
			"http://localhost/cdn-cgi/local/email?" +
				new URLSearchParams({
					from: "sender@example.com",
					to: "recipient@example.com",
					format: "json",
				}).toString(),
			{
				method: "POST",
				body: raw,
			}
		);

		expect(response.status).toBe(200);
		const handlerResult = (await response.json()) as {
			outcome: string;
			replies: Array<{ raw: string }>;
			events: Array<{ type: string }>;
		};
		expect(handlerResult).toMatchObject({
			outcome: "ok",
			events: [{ type: "received" }, { type: "reply" }],
		});
		const handlerReply = handlerResult.replies[0]?.raw ?? "";
		expect(new TextEncoder().encode(handlerReply).byteLength).toBeGreaterThan(
			MAX_EMAIL_BODY_BYTES
		);
		expect(handlerReply).toContain("€complete reply");
		expect(handlerReply).not.toContain("\uFFFD");
		expect(
			log.logsAtLevel(LogLevel.WARN).slice(warningCount)
		).not.toContainEqual(
			expect.stringContaining("Failed to capture received email")
		);

		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/routing?email_id=${encodeURIComponent("<received-large-reply@example.com>")}`
			),
			zEmailRoutingDetailResponse,
			expect
		);
		expect(detail.result?.events.map(({ type }) => type)).toEqual([
			"received",
			"reply",
		]);
		const reply = detail.result?.replies[0];
		expect(reply?.messageId).toMatch(/^<[A-Za-z0-9]{36}@example\.com>$/);
		expect(reply?.messageId).not.toBe("<large-reply@example.com>");
		expect(reply?.raw).toContain(`Message-ID: ${reply?.messageId}`);
		expect(detail.result?.events[1]).toMatchObject({
			type: "reply",
			messageId: reply?.messageId,
		});
		expect(detail.result?.raw).toContain("X-Test-Mode: reply-large");
		expect(reply?.raw).toContain("Subject: Large reply");
		expect(reply?.raw).not.toContain("\uFFFD");
		expect(detail.messages).toEqual([
			{
				code: 10604,
				message:
					"Displayed received email content was truncated during local capture. The complete message was still delivered to the Worker.",
			},
			{
				code: 10604,
				message:
					"Displayed reply content was truncated during local capture. The complete reply is available in the local filesystem; see the development log for its path.",
			},
		]);
		expect(
			Buffer.from(String(detail.result?.rawBase64), "base64").byteLength
		).toBe(MAX_EMAIL_BODY_BYTES);
		expect(
			new TextEncoder().encode(reply?.raw ?? "").byteLength
		).toBeLessThanOrEqual(MAX_EMAIL_BODY_BYTES);
		expect(
			log.logsAtLevel(LogLevel.WARN).slice(warningCount)
		).not.toContainEqual(expect.stringContaining("local storage row"));
	});

	test("stores multiple reply bodies directly", async ({ expect }) => {
		const response = await mf.dispatchFetch(
			`${BASE_URL}/local/email/routing/send?worker=${WORKER_NAME}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					from: "sender@example.com",
					to: ["recipient@example.com"],
					subject: "Many replies",
					text: "Many replies",
					headers: {
						"Message-ID": "<received-many-replies@example.com>",
						"X-Test-Mode": "reply-many",
					},
				}),
			}
		);
		expect(response.status).toBe(200);
		const sendResult = (await response.json()) as {
			result: { messageId: string };
		};
		const incomingMessageId = sendResult.result.messageId;

		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/routing?email_id=${encodeURIComponent(incomingMessageId)}`
			),
			zEmailRoutingDetailResponse,
			expect
		);
		expect(detail.result?.replies).toHaveLength(3);
		expect(detail.result?.replies[0]).toMatchObject({
			messageId: expect.stringMatching(/^<[A-Za-z0-9]{36}@example\.com>$/),
			raw: expect.stringContaining("Subject: Reply 0"),
		});
		expect(detail.result?.replies[2]).toMatchObject({
			messageId: expect.stringMatching(/^<[A-Za-z0-9]{36}@example\.com>$/),
			raw: expect.stringContaining("Subject: Reply 2"),
		});
	});

	test("delivers an email at the production limit and truncates only the captured copy", async ({
		expect,
	}) => {
		const headers =
			dedent`
				From: sender@example.com
				To: recipient@example.com
				Message-ID: <received-large@example.com>
				X-Test-Mode: assert-raw-size
				X-Expected-Raw-Size: ${MAX_PRODUCTION_EMAIL_BYTES}
				MIME-Version: 1.0
				Content-Type: text/plain
			` + "\r\n\r\n";
		const headerBytes = new TextEncoder().encode(headers).byteLength;
		const raw = headers + "x".repeat(MAX_PRODUCTION_EMAIL_BYTES - headerBytes);
		expect(new TextEncoder().encode(raw).byteLength).toBe(
			MAX_PRODUCTION_EMAIL_BYTES
		);

		const response = await mf.dispatchFetch(
			"http://localhost/cdn-cgi/local/email?" +
				new URLSearchParams({
					from: "sender@example.com",
					to: "recipient@example.com",
					format: "json",
				}).toString(),
			{ method: "POST", body: raw }
		);

		// Delivery succeeds regardless of size.
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ outcome: "ok" });

		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/routing?email_id=${encodeURIComponent("<received-large@example.com>")}`
			),
			zEmailRoutingDetailResponse,
			expect
		);
		// Full original size is recorded, but the captured raw is truncated.
		expect(detail.result?.rawSize).toBe(MAX_PRODUCTION_EMAIL_BYTES);
		expect(
			Buffer.from(String(detail.result?.rawBase64), "base64").byteLength
		).toBe(MAX_EMAIL_BODY_BYTES);
		expect(detail.messages).toEqual([
			{
				code: 10604,
				message:
					"Displayed received email content was truncated during local capture. The complete message was still delivered to the Worker.",
			},
		]);
	});

	test("sends a >1 MiB test email and truncates only the captured copy", async ({
		expect,
	}) => {
		const suppliedMessageId = "<received-large-test-send@example.com>";
		const response = await mf.dispatchFetch(
			`${BASE_URL}/local/email/routing/send?worker=${WORKER_NAME}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					from: "sender@example.com",
					to: ["recipient@example.com"],
					subject: "Large test email",
					text: "x".repeat(2 * 1024 * 1024),
					headers: {
						"Message-ID": suppliedMessageId,
						"X-Test-Mode": "assert-large-body",
					},
				}),
			}
		);

		const responseBody = await response.text();
		expect(response.status, responseBody).toBe(200);
		const result = JSON.parse(responseBody) as {
			result: { messageId: string; outcome: string };
		};
		expect(result).toMatchObject({ result: { outcome: "ok" } });
		const messageId = result.result.messageId;
		expect(messageId).toMatch(/^<[A-Za-z0-9]{36}@example\.com>$/);
		expect(messageId).not.toBe(suppliedMessageId);

		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/routing?email_id=${encodeURIComponent(messageId)}`
			),
			zEmailRoutingDetailResponse,
			expect
		);
		expect(detail.result?.messageId).toBe(messageId);
		expect(detail.result?.raw).toContain(`Message-ID: ${messageId}`);
		expect(detail.result?.raw).not.toContain(suppliedMessageId);
		expect(detail.result?.raw?.match(/^Message-ID:/gim)).toHaveLength(1);
		expect(detail.result?.rawSize).toBeGreaterThan(MAX_EMAIL_BODY_BYTES);
		expect(
			Buffer.from(String(detail.result?.rawBase64), "base64").byteLength
		).toBe(MAX_EMAIL_BODY_BYTES);
		expect(detail.messages).toEqual([
			{
				code: 10604,
				message:
					"Displayed received email content was truncated during local capture. The complete message was still delivered to the Worker.",
			},
		]);
	});

	test("rejects a received email larger than the production limit", async ({
		expect,
	}) => {
		const headers =
			dedent`
				From: sender@example.com
				To: recipient@example.com
				Message-ID: <received-too-large@example.com>
				MIME-Version: 1.0
				Content-Type: text/plain
			` + "\r\n\r\n";
		const headerBytes = new TextEncoder().encode(headers).byteLength;
		// One byte over the production Email Routing limit.
		const raw =
			headers + "x".repeat(MAX_PRODUCTION_EMAIL_BYTES + 1 - headerBytes);

		const response = await mf.dispatchFetch(
			"http://localhost/cdn-cgi/local/email?" +
				new URLSearchParams({
					from: "sender@example.com",
					to: "recipient@example.com",
					format: "json",
				}).toString(),
			{ method: "POST", body: raw }
		);

		// Matches production: oversized messages are rejected, not delivered.
		expect(response.status).toBe(400);
		expect(await response.text()).toContain("production size limit of 25 MiB");
	});

	test("stores received handler events and details", async ({ expect }) => {
		const raw = dedent`
			From: sender@example.com
			To: recipient@example.com
			Message-ID: <received-forward@example.com>
			X-Test-Mode: forward
			MIME-Version: 1.0
			Content-Type: text/plain

			Received message.
		`;
		const response = await mf.dispatchFetch(
			"http://localhost/cdn-cgi/local/email?" +
				new URLSearchParams({
					from: "sender@example.com",
					to: "recipient@example.com",
					format: "json",
				}).toString(),
			{
				method: "POST",
				body: raw,
			}
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			outcome: "ok",
			forwards: [
				{
					recipient: "forwarded@example.com",
				},
			],
		});

		const list = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/routing?worker=${WORKER_NAME}`
			),
			zEmailListRoutingResponse,
			expect
		);
		const item = getListResult(list.result).find(
			(email) => email.messageId === "<received-forward@example.com>"
		);
		expect(item).toMatchObject({
			worker: WORKER_NAME,
			from: "sender@example.com",
			to: "recipient@example.com",
			outcome: "ok",
			forwards: [
				{
					recipient: "forwarded@example.com",
				},
			],
		});
		expect(item?.events.map(({ type }) => type)).toEqual([
			"received",
			"forward",
		]);

		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/routing?email_id=${encodeURIComponent("<received-forward@example.com>")}`
			),
			zEmailRoutingDetailResponse,
			expect
		);
		expect(detail.result).toMatchObject({
			raw,
			rawBase64: Buffer.from(raw).toString("base64"),
		});
	});

	test("omits BCC from routing items but retains it on sent items", async ({
		expect,
	}) => {
		const routingMessageId = "<received-bcc@example.com>";
		const routingRaw = dedent`
			From: sender@example.com
			To: recipient@example.com
			Cc: copy@example.com
			Bcc: hidden@example.com
			Message-ID: ${routingMessageId}
			Subject: Routing BCC
			X-Test-Mode: assert-no-bcc
			MIME-Version: 1.0
			Content-Type: text/plain

			Recipients must not see BCC.
		`;
		const routingResponse = await mf.dispatchFetch(
			"http://localhost/cdn-cgi/local/email?" +
				new URLSearchParams({
					from: "sender@example.com",
					to: "recipient@example.com",
					format: "json",
				}).toString(),
			{
				method: "POST",
				body: routingRaw,
			}
		);
		const routingResponseBody = await routingResponse.text();
		expect(routingResponse.status, routingResponseBody).toBe(200);
		const routingResult = JSON.parse(routingResponseBody);
		expect(routingResult).toMatchObject({ outcome: "ok" });
		expect(routingResult).not.toHaveProperty("rejectReason");

		const routingDetail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/routing?email_id=${encodeURIComponent(routingMessageId)}`
			),
			zEmailRoutingDetailResponse,
			expect
		);
		expect(routingDetail.result).toMatchObject({
			cc: ["copy@example.com"],
		});
		expect(routingDetail.result).not.toHaveProperty("bcc");
		expect(
			Object.keys(routingDetail.result?.headers ?? {}).map((key) =>
				key.toLowerCase()
			)
		).not.toContain("bcc");
		expect(routingDetail.result?.raw).not.toMatch(/^bcc:/imu);

		const sentResponse = await mf.dispatchFetch(
			"http://localhost/send-builder",
			{
				method: "POST",
				body: JSON.stringify({
					from: "sender@example.com",
					to: "recipient@example.com",
					bcc: "hidden@example.com",
					subject: "Sent BCC",
					text: "Sender may inspect BCC.",
				}),
			}
		);
		expect(sentResponse.status).toBe(200);
		const sentResult = (await sentResponse.json()) as { messageId: string };
		const sentDetail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/sending?email_id=${encodeURIComponent(sentResult.messageId)}`
			),
			zEmailSendingDetailResponse,
			expect
		);
		expect(sentDetail.result?.bcc).toEqual(["hidden@example.com"]);

		const rawResponse = await mf.dispatchFetch(
			"http://localhost/send-raw?" +
				new URLSearchParams({
					from: "sender@example.com",
					to: "recipient@example.com",
				}).toString(),
			{
				method: "POST",
				body: dedent`
					From: sender@example.com
					To: recipient@example.com
					Bcc: raw-hidden@example.com
					Message-ID: <sent-raw-bcc@example.com>
					Subject: Sent raw BCC
					MIME-Version: 1.0
					Content-Type: text/plain

					Sender may inspect raw BCC.
				`,
			}
		);
		expect(rawResponse.status).toBe(200);
		const rawResult = (await rawResponse.json()) as { messageId: string };
		const rawDetail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/sending?email_id=${encodeURIComponent(rawResult.messageId)}`
			),
			zEmailSendingDetailResponse,
			expect
		);
		expect(rawDetail.result?.bcc).toEqual(["raw-hidden@example.com"]);
	});

	test("filters received emails by worker and records rejection", async ({
		expect,
	}) => {
		const response = await mf.dispatchFetch(
			`${BASE_URL}/local/email/routing/send?worker=${WORKER_NAME}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					from: "sender@example.com",
					to: ["recipient@example.com"],
					subject: "Rejected message",
					text: "Rejected",
					headers: {
						"Message-ID": "<received-reject@example.com>",
						"X-Test-Mode": "reject",
					},
				}),
			}
		);

		expect(response.status).toBe(200);
		const sendResult = (await response.json()) as {
			result: {
				messageId: string;
				outcome: string;
				rejectReason?: string;
			};
		};
		expect(sendResult.result).toMatchObject({
			outcome: "ok",
			rejectReason: "Rejected by test worker",
		});
		const messageId = sendResult.result.messageId;

		const rejectedDetail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/routing?email_id=${encodeURIComponent(messageId)}&worker=${WORKER_NAME}`
			),
			zEmailRoutingDetailResponse,
			expect
		);
		expect(rejectedDetail.result).toMatchObject({
			rejectReason: "Rejected by test worker",
		});
		expect(rejectedDetail.result?.events.map(({ type }) => type)).toEqual([
			"received",
			"reject",
		]);

		const filtered = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/routing?worker=other-worker`
			),
			zEmailListRoutingResponse,
			expect
		);
		expect(getListResult(filtered.result)).toEqual([]);

		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/routing?email_id=${encodeURIComponent(messageId)}&worker=other-worker`
			),
			zWorkersApiResponseCommonFailure,
			expect,
			404
		);
		expect(detail.result).toBeNull();
	});

	test("does not duplicate Content-Type when a test email supplies one", async ({
		expect,
	}) => {
		const response = await mf.dispatchFetch(
			`${BASE_URL}/local/email/routing/send?worker=${WORKER_NAME}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					from: "sender@example.com",
					to: ["recipient@example.com"],
					subject: "Custom content type",
					text: "Body text",
					headers: {
						"Message-ID": "<received-custom-ct@example.com>",
						// A caller-supplied content type must not be emitted: the
						// generated one describes the actual body.
						"Content-Type": "application/json",
					},
				}),
			}
		);

		expect(response.status).toBe(200);
		const sendResult = (await response.json()) as {
			result: { messageId: string; outcome: string };
		};
		expect(sendResult.result).toMatchObject({ outcome: "ok" });
		const messageId = sendResult.result.messageId;

		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/routing?email_id=${encodeURIComponent(messageId)}`
			),
			zEmailRoutingDetailResponse,
			expect
		);
		const raw = detail.result?.raw ?? "";
		const contentTypeLines = raw
			.split(/\r?\n/)
			.filter((line) => /^content-type:/i.test(line));
		// Exactly one Content-Type, and it's the generated one describing the body.
		expect(contentTypeLines).toEqual([
			"Content-Type: text/plain; charset=utf-8",
		]);
	});

	test("rejects invalid custom header names", async ({ expect }) => {
		const response = await mf.dispatchFetch(
			`${BASE_URL}/local/email/routing/send?worker=${WORKER_NAME}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					from: "sender@example.com",
					to: ["recipient@example.com"],
					subject: "Invalid custom header",
					text: "Body text",
					headers: {
						"Invalid Header": "value",
					},
				}),
			}
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			errors: [
				{
					message: "Custom headers must use valid names and values.",
				},
			],
		});
	});

	test("accepts a zero-byte attachment in a test email", async ({ expect }) => {
		const response = await mf.dispatchFetch(
			`${BASE_URL}/local/email/routing/send?worker=${WORKER_NAME}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					from: "sender@example.com",
					to: ["recipient@example.com"],
					subject: "Empty attachment",
					text: "Attached file is empty.",
					attachments: [
						{
							filename: "empty.txt",
							type: "text/plain",
							content: "",
						},
					],
				}),
			}
		);

		const responseBody = await response.text();
		expect(response.status, responseBody).toBe(200);
		const result = JSON.parse(responseBody) as {
			result: { messageId: string };
		};
		const messageId = result.result.messageId;

		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/routing?email_id=${encodeURIComponent(messageId)}`
			),
			zEmailRoutingDetailResponse,
			expect
		);
		expect(detail.result?.attachments).toEqual([
			{
				filename: "empty.txt",
				contentType: "text/plain",
				disposition: "attachment",
				size: 0,
			},
		]);
	});

	test("reports a descriptive error when the target worker has no email() handler", async ({
		expect,
	}) => {
		const failure = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/routing/send?worker=${NO_EMAIL_HANDLER_WORKER_NAME}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						from: "sender@example.com",
						to: ["recipient@example.com"],
						subject: "No handler",
						text: "No handler",
						headers: { "Message-ID": "<no-handler@example.com>" },
					}),
				}
			),
			zWorkersApiResponseCommonFailure,
			expect,
			400
		);
		expect(failure.errors).toEqual([
			expect.objectContaining({
				message: `Worker '${NO_EMAIL_HANDLER_WORKER_NAME}' does not export an email() handler.`,
			}),
		]);

		const list = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/routing?worker=${NO_EMAIL_HANDLER_WORKER_NAME}`
			),
			zEmailListRoutingResponse,
			expect
		);
		const detail = getListResult(list.result).find(
			(email) => email.subject === "No handler"
		);
		expect(detail).toMatchObject({
			worker: NO_EMAIL_HANDLER_WORKER_NAME,
			messageId: expect.stringMatching(/^<[A-Za-z0-9]{36}@example\.com>$/),
			outcome: "exception",
		});
		expect(detail?.events.map(({ type }) => type)).toEqual(["unhandled"]);
	});

	test("stores reply events and reply content", async ({ expect }) => {
		const response = await mf.dispatchFetch(
			`${BASE_URL}/local/email/routing/send?worker=${WORKER_NAME}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					from: "sender@example.com",
					to: ["recipient@example.com"],
					subject: "Reply target",
					text: "Reply target",
					headers: {
						"Message-ID": "<received-reply@example.com>",
						"X-Test-Mode": "reply",
					},
				}),
			}
		);

		expect(response.status).toBe(200);
		const sendResult = (await response.json()) as {
			result: { messageId: string; outcome: string };
		};
		expect(sendResult.result).toMatchObject({ outcome: "ok" });
		const incomingMessageId = sendResult.result.messageId;
		expect(incomingMessageId).toMatch(/^<[A-Za-z0-9]{36}@example\.com>$/);

		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/routing?email_id=${encodeURIComponent(incomingMessageId)}`
			),
			zEmailRoutingDetailResponse,
			expect
		);
		expect(detail.result?.events.map(({ type }) => type)).toEqual([
			"received",
			"reply",
		]);
		const reply = detail.result?.replies[0];
		expect(reply?.messageId).toMatch(/^<[A-Za-z0-9]{36}@example\.com>$/);
		expect(reply).toMatchObject({
			sender: "reply@example.com",
			raw: expect.stringContaining(`References: ${incomingMessageId}`),
			rawBase64: expect.any(String),
		});
		expect(reply?.messageId).not.toBe("<reply@example.com>");
		expect(reply?.raw).toContain(`Message-ID: ${reply?.messageId}`);
		expect(reply?.raw).not.toContain("Message-ID: <reply@example.com>");
		expect(detail.result?.events[1]).toMatchObject({
			type: "reply",
			messageId: reply?.messageId,
		});
		expect(reply?.raw).toContain("Subject: Reply subject");
		expect(reply?.raw).toContain(
			"Body literal =?UTF-8?B?U2hvdWxkIHN0YXkgcmF3?="
		);
		expect(
			Buffer.from(String(reply?.rawBase64), "base64").toString()
		).toContain("Subject: =?UTF-8?B?UmVwbHkgc3ViamVjdA==?=");
	});

	test(
		"retains all received emails and paginates results",
		{ retry: 0 },
		async ({ expect }) => {
			for (let index = 0; index <= 200; index++) {
				const response = await mf.dispatchFetch(
					`${BASE_URL}/local/email/routing/send?worker=${WORKER_NAME}`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							from: "sender@example.com",
							to: ["recipient@example.com"],
							subject: `Retention test ${index}`,
							text: `Message ${index}`,
						}),
					}
				);
				expect(response.status).toBe(200);
				await response.json();
			}

			const firstPage = await expectValidResponse(
				await mf.dispatchFetch(`${BASE_URL}/local/email/routing?per_page=100`),
				zEmailListRoutingResponse,
				expect
			);
			const cursor = firstPage.result_info?.cursor;
			expect(cursor).toEqual(expect.any(String));
			const secondPage = await expectValidResponse(
				await mf.dispatchFetch(
					`${BASE_URL}/local/email/routing?per_page=100&cursor=${encodeURIComponent(String(cursor))}`
				),
				zEmailListRoutingResponse,
				expect
			);
			const thirdPage = await expectValidResponse(
				await mf.dispatchFetch(
					`${BASE_URL}/local/email/routing?per_page=100&cursor=${encodeURIComponent(String(secondPage.result_info?.cursor))}`
				),
				zEmailListRoutingResponse,
				expect
			);
			const retained = [
				...getListResult(firstPage.result),
				...getListResult(secondPage.result),
				...getListResult(thirdPage.result),
			].filter((email) => email.subject.startsWith("Retention test "));
			expect(retained).toHaveLength(201);
			expect(firstPage.result_info).toMatchObject({
				count: 100,
				per_page: 100,
				has_more: true,
			});
			expect(secondPage.result_info).toMatchObject({
				count: 100,
				per_page: 100,
				has_more: true,
			});
			expect(thirdPage.result_info).toMatchObject({
				per_page: 100,
				has_more: false,
			});
			expect(
				getListResult(thirdPage.result).filter((email) =>
					email.subject.startsWith("Retention test ")
				)
			).toHaveLength(1);
			expect(getListResult(firstPage.result)[0]?.subject).toBe(
				"Retention test 200"
			);
			expect(retained.at(-1)?.subject).toBe("Retention test 0");
		}
	);

	test("rejects malformed aggregate cursors", async ({ expect }) => {
		const cursor = `a.${Buffer.from(JSON.stringify({ local: 123 })).toString(
			"base64"
		)}`;
		const response = await mf.dispatchFetch(
			`${BASE_URL}/local/email/routing?cursor=${encodeURIComponent(cursor)}`
		);
		await response.text();
		expect(response.status).toBe(400);
	});

	test("paginates storage by timestamp and insertion sequence", async ({
		expect,
	}) => {
		await clearEmailStore(mf);
		for (const [messageId, sentAt] of [
			["<timestamp-newest@example.com>", "2026-08-20T03:00:00.000Z"],
			["<timestamp-oldest@example.com>", "2026-08-20T01:00:00.000Z"],
			["<timestamp-middle@example.com>", "2026-08-20T02:00:00.000Z"],
			["<timestamp-tie-old@example.com>", "2026-08-20T00:00:00.000Z"],
			["<timestamp-tie-new@example.com>", "2026-08-20T00:00:00.000Z"],
		] as const) {
			await storeSentEmail(mf, {
				worker: WORKER_NAME,
				messageId,
				sentAt,
			});
		}

		const messageIds: string[] = [];
		let cursor: string | undefined;
		do {
			const params = new URLSearchParams({ per_page: "1" });
			if (cursor !== undefined) {
				params.set("cursor", cursor);
			}
			const page = await expectExplorerApiResponse(
				mf,
				`/local/email/sending?${params}`,
				zEmailListSendingResponse,
				expect
			);
			messageIds.push(
				...getListResult(page.result).map(({ messageId }) => messageId)
			);
			cursor = page.result_info?.cursor;
		} while (cursor !== undefined);

		expect(messageIds).toEqual([
			"<timestamp-newest@example.com>",
			"<timestamp-middle@example.com>",
			"<timestamp-oldest@example.com>",
			"<timestamp-tie-new@example.com>",
			"<timestamp-tie-old@example.com>",
		]);
	});

	test("rejects fractional email page sizes", async ({ expect }) => {
		for (const resource of ["routing", "sending"]) {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/local/email/${resource}?per_page=1.5`
			);
			const responseBody = await response.text();
			expect(response.status, responseBody).toBe(400);
		}
	});

	test("does not expose pagination source identity", async ({ expect }) => {
		const response = await mf.dispatchFetch(
			`${BASE_URL}/local/email/source-id`
		);
		await response.text();
		expect(response.status).toBe(404);
	});

	test("does not restart an exhausted local source", async ({ expect }) => {
		for (const [resource, schema] of [
			["routing", zEmailListRoutingResponse],
			["sending", zEmailListSendingResponse],
		] as const) {
			const cursor = encodeTestAggregateCursor({ local: null }, resource);
			const page = await expectValidResponse(
				await mf.dispatchFetch(
					`${BASE_URL}/local/email/${resource}?cursor=${encodeURIComponent(cursor)}`
				),
				schema,
				expect
			);
			expect(page.result).toEqual([]);
			expect(page.result_info).toMatchObject({
				count: 0,
				has_more: false,
			});
			expect(page.result_info).not.toHaveProperty("cursor");
		}
	});

	test("accepts cursors scoped to Unicode worker names", async ({ expect }) => {
		const cursor = encodeTestAggregateCursor(
			{ local: null },
			"routing",
			UNICODE_WORKER_NAME
		);
		const params = new URLSearchParams({
			worker: UNICODE_WORKER_NAME,
			cursor,
		});
		const page = await expectValidResponse(
			await mf.dispatchFetch(`${BASE_URL}/local/email/routing?${params}`),
			zEmailListRoutingResponse,
			expect
		);
		expect(page.result).toEqual([]);
		expect(page.result_info?.has_more).toBe(false);
	});

	test("preserves aggregate cursor sources that are no longer available", async ({
		expect,
	}) => {
		for (let index = 0; index < 2; index++) {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/local/email/routing/send?worker=${WORKER_NAME}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						from: "sender@example.com",
						to: ["recipient@example.com"],
						subject: "Stale cursor",
						text: "Stale cursor",
						headers: {
							"Message-ID": `<stale-cursor-${index}@example.com>`,
						},
					}),
				}
			);
			expect(response.status).toBe(200);
			await response.json();
		}
		const cursor = encodeTestAggregateCursor({ "stale-peer": "cursor" });
		const page = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/local/email/routing?per_page=1&cursor=${encodeURIComponent(cursor)}`
			),
			zEmailListRoutingResponse,
			expect
		);
		expect(page.result_info?.cursor).toEqual(expect.any(String));
		expect(
			decodeTestAggregateCursor(String(page.result_info?.cursor))
		).toMatchObject({
			"stale-peer": "cursor",
			local: expect.any(String),
		});
	});
});

describe("Local Explorer email aggregation", () => {
	let registryPath: string;
	let instanceA: Miniflare;
	let instanceB: Miniflare;
	let instanceC: Miniflare;

	beforeAll(async () => {
		registryPath = mkdtempSync(path.join(tmpdir(), "mf-email-registry-"));
		instanceA = new Miniflare(emailPeerOptions(registryPath, "email-a", true));
		instanceB = new Miniflare(
			emailPeerOptions(registryPath, ["email-b", "email-b-secondary"], true)
		);
		instanceC = new Miniflare(emailPeerOptions(registryPath, "email-c", true));
		await Promise.all([instanceA.ready, instanceB.ready, instanceC.ready]);
		await waitForWorkersInRegistry(registryPath, [
			"email-a",
			"email-b",
			"email-b-secondary",
			"email-c",
		]);
	});

	afterAll(async () => {
		await Promise.all([
			disposeWithRetry(instanceA),
			disposeWithRetry(instanceB),
			disposeWithRetry(instanceC),
		]);
		removeDirSync(registryPath);
	});

	test("aggregates peer records and proxies peer details", async ({
		expect,
	}) => {
		const messageId = await sendRoutingTestEmail(
			instanceA,
			"email-b",
			{
				messageId: "<ignored-peer-received@example.com>",
				subject: "Peer email",
				text: "Stored by the peer instance",
			},
			expect
		);

		const list = await expectExplorerApiResponse(
			instanceA,
			"/local/email/routing",
			zEmailListRoutingResponse,
			expect
		);
		expect(getListResult(list.result)).toEqual([
			expect.objectContaining({ worker: "email-b", messageId }),
		]);
		expect(list.result_info).toMatchObject({
			count: 1,
			has_more: false,
		});

		const filteredList = await expectExplorerApiResponse(
			instanceA,
			"/local/email/routing?worker=email-b",
			zEmailListRoutingResponse,
			expect
		);
		expect(getListResult(filteredList.result)).toEqual([
			expect.objectContaining({ worker: "email-b", messageId }),
		]);
		expect(filteredList.result_info).toMatchObject({
			count: 1,
			has_more: false,
		});

		const detail = await expectExplorerApiResponse(
			instanceA,
			`/local/email/routing?email_id=${encodeURIComponent(messageId)}`,
			zEmailRoutingDetailResponse,
			expect
		);
		expect(detail.result).toMatchObject({
			worker: "email-b",
			messageId,
		});

		const wrongWorker = await expectExplorerApiResponse(
			instanceA,
			`/local/email/routing?email_id=${encodeURIComponent(messageId)}&worker=email-a`,
			zWorkersApiResponseCommonFailure,
			expect,
			404
		);
		expect(wrongWorker.result).toBeNull();
	});

	test("routes worker-scoped requests to the owning peer", async ({
		expect,
	}) => {
		const messageId = await sendRoutingTestEmail(
			instanceA,
			"email-c",
			{
				messageId: "<ignored-multi-peer-received@example.com>",
				subject: "Multi-peer email",
				text: "Stored by the owning peer instance",
			},
			expect
		);

		const detail = await expectExplorerApiResponse(
			instanceA,
			`/local/email/routing?email_id=${encodeURIComponent(messageId)}&worker=email-c`,
			zEmailRoutingDetailResponse,
			expect
		);
		expect(detail.result).toMatchObject({
			worker: "email-c",
			messageId,
		});
	});

	test("rejects malformed cursors belonging to a peer source", async ({
		expect,
	}) => {
		await Promise.all([instanceA, instanceB, instanceC].map(clearEmailStore));
		await storeSentEmail(instanceB, {
			worker: "email-b",
			messageId: "<peer-cursor-new@example.com>",
			sentAt: "2026-08-20T02:00:00.000Z",
		});
		await storeSentEmail(instanceB, {
			worker: "email-b",
			messageId: "<peer-cursor-old@example.com>",
			sentAt: "2026-08-20T01:00:00.000Z",
		});

		const firstPage = await expectExplorerApiResponse(
			instanceC,
			"/local/email/sending?per_page=1",
			zEmailListSendingResponse,
			expect
		);
		const cursor = String(firstPage.result_info?.cursor);
		const state = decodeTestAggregateCursor(cursor);
		const peerSource = Object.entries(state).find(
			([source, sourceCursor]) =>
				source.startsWith("peer:") && typeof sourceCursor === "string"
		)?.[0];
		if (peerSource === undefined) {
			throw new Error("Expected an advancing peer cursor");
		}

		const malformed = encodeTestAggregateCursor(
			{ ...state, [peerSource]: "invalid-peer-cursor" },
			"sending"
		);
		const response = await dispatchExplorerApi(
			instanceC,
			`/local/email/sending?per_page=1&cursor=${encodeURIComponent(malformed)}`
		);
		const body = await response.json();
		expect(response.status).toBe(400);
		expect(body).toMatchObject({
			errors: [{ message: "Invalid email pagination cursor" }],
		});
	});

	test("preserves errors returned by a known worker owner", async ({
		expect,
	}) => {
		await Promise.all([instanceA, instanceB, instanceC].map(clearEmailStore));
		const store = (await instanceB._getProxyClient()).env[
			CoreBindings.SERVICE_EMAIL_STORE
		] as unknown as { storeSent(email: unknown): Promise<void> };
		await store.storeSent({
			worker: "email-b",
			messageId: "<invalid-peer-record@example.com>",
			sentAt: "2026-08-20T00:00:00.000Z",
		});

		const listResponse = await dispatchExplorerApi(
			instanceA,
			"/local/email/sending?worker=email-b"
		);
		await listResponse.text();
		expect(listResponse.status).toBe(500);

		const detailResponse = await dispatchExplorerApi(
			instanceA,
			`/local/email/sending?worker=email-b&email_id=${encodeURIComponent("<invalid-peer-record@example.com>")}`
		);
		await detailResponse.text();
		expect(detailResponse.status).toBe(500);

		const unfilteredDetailResponse = await dispatchExplorerApi(
			instanceA,
			`/local/email/sending?email_id=${encodeURIComponent("<invalid-peer-record@example.com>")}`
		);
		await unfilteredDetailResponse.text();
		expect(unfilteredDetailResponse.status).toBe(500);
	});

	test("reports unavailable peers for email lookups", async ({ expect }) => {
		const unavailableWorker = "email-unavailable";
		const definitionPath = path.join(registryPath, unavailableWorker);
		writeFileSync(
			definitionPath,
			JSON.stringify({
				debugPortAddress: "127.0.0.1:1",
				defaultEntrypointService: unavailableWorker,
				userWorkerService: unavailableWorker,
			})
		);
		try {
			const response = await expectExplorerApiResponse(
				instanceA,
				`/local/email/routing?email_id=${encodeURIComponent("<missing@example.com>")}`,
				zWorkersApiResponseCommonFailure,
				expect,
				502
			);
			expect(response.errors).toEqual([
				expect.objectContaining({
					code: 10603,
					message:
						"One or more workers are temporarily unavailable in this dev session.",
				}),
			]);

			const filteredList = await expectExplorerApiResponse(
				instanceA,
				`/local/email/routing?worker=${unavailableWorker}`,
				zWorkersApiResponseCommonFailure,
				expect,
				502
			);
			expect(filteredList.errors).toEqual([
				expect.objectContaining({
					code: 10603,
					message: `Worker '${unavailableWorker}' is temporarily unavailable in this dev session.`,
				}),
			]);

			const filteredDetail = await expectExplorerApiResponse(
				instanceA,
				`/local/email/routing?worker=${unavailableWorker}&email_id=${encodeURIComponent("<missing@example.com>")}`,
				zWorkersApiResponseCommonFailure,
				expect,
				502
			);
			expect(filteredDetail.errors).toEqual([
				expect.objectContaining({
					code: 10603,
					message: `Worker '${unavailableWorker}' is temporarily unavailable in this dev session.`,
				}),
			]);
		} finally {
			unlinkSync(definitionPath);
		}
	});

	test("paginates and opens worker-scoped details across multi-worker peers", async ({
		expect,
	}) => {
		await Promise.all([instanceA, instanceB, instanceC].map(clearEmailStore));

		async function sendRaw(
			instance: Miniflare,
			worker: string,
			label: string
		): Promise<{ messageId: string; raw: string; worker: string }> {
			const raw = [
				`From: ${label}@example.com`,
				"To: recipient@example.com",
				`Message-ID: <${label}@example.com>`,
				`Subject: ${label}`,
				"Content-Type: text/plain",
				"",
				`Body ${label}`,
			].join("\r\n");
			const fetcher = await instance.getWorker(worker);
			const response = await fetcher.fetch(
				"http://localhost/send-raw?" +
					new URLSearchParams({
						from: `${label}@example.com`,
						to: "recipient@example.com",
					}),
				{ method: "POST", body: raw }
			);
			expect(response.status).toBe(200);
			const result = (await response.json()) as { messageId: string };
			return {
				messageId: result.messageId,
				raw: raw.replace(
					`Message-ID: <${label}@example.com>`,
					`Message-ID: ${result.messageId}`
				),
				worker,
			};
		}

		const sent = [];
		sent.push(await sendRaw(instanceA, "email-a", "multi-sent-a"));
		sent.push(
			await sendRaw(instanceB, "email-b-secondary", "multi-sent-b-secondary")
		);
		sent.push(await sendRaw(instanceB, "email-b", "multi-sent-b-1"));
		sent.push(await sendRaw(instanceB, "email-b", "multi-sent-b-2"));

		const listedMessageIds: string[] = [];
		let cursor: string | undefined;
		do {
			const params = new URLSearchParams({ per_page: "1" });
			if (cursor !== undefined) {
				params.set("cursor", cursor);
			}
			const page = await expectExplorerApiResponse(
				instanceC,
				`/local/email/sending?${params}`,
				zEmailListSendingResponse,
				expect
			);
			listedMessageIds.push(
				...getListResult(page.result).map(({ messageId }) => messageId)
			);
			cursor = page.result_info?.cursor;
			if (page.result_info?.has_more) {
				expect(cursor).toEqual(expect.any(String));
			}
		} while (cursor !== undefined);

		expect(listedMessageIds).toHaveLength(sent.length);
		expect(new Set(listedMessageIds)).toEqual(
			new Set(sent.map(({ messageId }) => messageId))
		);

		for (const email of sent) {
			const detail = await expectValidResponse(
				await instanceC.dispatchFetch(
					`${BASE_URL}/local/email/sending?email_id=${encodeURIComponent(email.messageId)}&worker=${email.worker}`
				),
				zEmailSendingDetailResponse,
				expect
			);
			expect(detail.result).toMatchObject({
				worker: email.worker,
				messageId: email.messageId,
				raw: email.raw,
				rawBase64: Buffer.from(email.raw).toString("base64"),
			});
		}
		const primarySentEmail = sent.find(({ worker }) => worker === "email-b");
		if (primarySentEmail === undefined) {
			throw new Error("Expected a sent email from email-b");
		}
		const wrongSentWorker = await expectExplorerApiResponse(
			instanceC,
			`/local/email/sending?email_id=${encodeURIComponent(primarySentEmail.messageId)}&worker=email-b-secondary`,
			zWorkersApiResponseCommonFailure,
			expect,
			404
		);
		expect(wrongSentWorker.result).toBeNull();

		const filteredPage = await expectExplorerApiResponse(
			instanceC,
			"/local/email/sending?worker=email-b&per_page=1",
			zEmailListSendingResponse,
			expect
		);
		expect(getListResult(filteredPage.result)).toEqual([
			expect.objectContaining({ worker: "email-b" }),
		]);
		const filteredCursor = filteredPage.result_info?.cursor;
		expect(filteredCursor).toEqual(expect.any(String));
		const filteredState = decodeTestAggregateCursor(String(filteredCursor));
		expect(Object.keys(filteredState)).toEqual(["local"]);
		const filteredLastPage = await expectExplorerApiResponse(
			instanceC,
			`/local/email/sending?worker=email-b&per_page=1&cursor=${encodeURIComponent(String(filteredCursor))}`,
			zEmailListSendingResponse,
			expect
		);
		expect(getListResult(filteredLastPage.result)).toEqual([
			expect.objectContaining({ worker: "email-b" }),
		]);
		const filteredIds = [
			...getListResult(filteredPage.result).map(({ messageId }) => messageId),
			...getListResult(filteredLastPage.result).map(
				({ messageId }) => messageId
			),
		];
		expect(new Set(filteredIds)).toEqual(
			new Set(
				sent
					.filter(({ worker }) => worker === "email-b")
					.map(({ messageId }) => messageId)
			)
		);
		expect(filteredLastPage.result_info).toMatchObject({
			count: 1,
			has_more: false,
		});
		expect(filteredLastPage.result_info).not.toHaveProperty("cursor");
		for (const path of [
			`/local/email/sending?worker=email-b-secondary&cursor=${encodeURIComponent(String(filteredCursor))}`,
			`/local/email/routing?worker=email-b&cursor=${encodeURIComponent(String(filteredCursor))}`,
		]) {
			const response = await dispatchExplorerApi(instanceC, path);
			await response.text();
			expect(response.status).toBe(400);
		}

		const duplicateMessageId = "<multi-worker-duplicate@example.com>";
		for (const [worker, subject] of [
			["email-b", "Primary worker detail"],
			["email-b-secondary", "Secondary worker detail"],
		] as const) {
			await storeReceivedEmail(instanceC, {
				worker,
				messageId: duplicateMessageId,
				subject,
				text: `Body for ${worker}`,
			});
		}

		for (const [worker, subject] of [
			["email-b", "Primary worker detail"],
			["email-b-secondary", "Secondary worker detail"],
		] as const) {
			const detail = await expectExplorerApiResponse(
				instanceC,
				`/local/email/routing?email_id=${encodeURIComponent(duplicateMessageId)}&worker=${worker}`,
				zEmailRoutingDetailResponse,
				expect
			);
			expect(detail.result).toMatchObject({
				worker,
				messageId: duplicateMessageId,
				subject,
				raw: expect.stringContaining(`Body for ${worker}`),
			});
		}
	});

	test("paginates filtered received emails without an empty terminal page", async ({
		expect,
	}) => {
		for (const [worker, messageId] of [
			["email-a", "<local-target-old@example.com>"],
			["email-c", "<local-other@example.com>"],
			["email-a", "<local-target-new@example.com>"],
		]) {
			await storeReceivedEmail(instanceA, {
				worker,
				messageId,
				subject: "Filtered pagination test",
				text: "Filtered pagination test",
			});
		}

		const firstPage = await expectExplorerApiResponse(
			instanceA,
			"/local/email/routing?worker=email-a&per_page=1",
			zEmailListRoutingResponse,
			expect
		);
		expect(getListResult(firstPage.result)).toEqual([
			expect.objectContaining({
				worker: "email-a",
				messageId: "<local-target-new@example.com>",
			}),
		]);
		expect(firstPage.result_info).toMatchObject({ count: 1, has_more: true });
		const cursor = firstPage.result_info?.cursor;
		expect(cursor).toEqual(expect.any(String));
		const state = decodeTestAggregateCursor(String(cursor));
		expect(Object.keys(state)).toEqual(["local"]);

		const lastPage = await expectExplorerApiResponse(
			instanceA,
			`/local/email/routing?worker=email-a&per_page=1&cursor=${encodeURIComponent(String(cursor))}`,
			zEmailListRoutingResponse,
			expect
		);
		expect(getListResult(lastPage.result)).toEqual([
			expect.objectContaining({
				worker: "email-a",
				messageId: "<local-target-old@example.com>",
			}),
		]);
		expect(lastPage.result_info).toMatchObject({ count: 1, has_more: false });
		expect(lastPage.result_info).not.toHaveProperty("cursor");
	});
});

describe("Local Explorer email pagination source churn", () => {
	test("resumes a peer without replaying after it unregisters", async ({
		expect,
	}) => {
		const registryPath = mkdtempSync(path.join(tmpdir(), "mf-email-churn-"));
		const optionsA = emailPeerOptions(registryPath, "churn-a", true);
		const optionsB = emailPeerOptions(registryPath, "churn-b", true);
		const instanceA = new Miniflare(optionsA);
		const instanceB = new Miniflare(optionsB);

		try {
			await Promise.all([instanceA.ready, instanceB.ready]);
			await waitForWorkersInRegistry(registryPath, ["churn-a", "churn-b"]);

			for (let index = 0; index < 3; index++) {
				await storeReceivedEmail(instanceA, {
					worker: "churn-a",
					messageId: `<churn-a-${index}@example.com>`,
					subject: "Source churn",
					text: "Source churn",
				});
			}
			for (let index = 0; index < 2; index++) {
				await storeReceivedEmail(instanceB, {
					worker: "churn-b",
					messageId: `<churn-b-${index}@example.com>`,
					subject: "Source churn",
					text: "Source churn",
				});
			}

			const firstPage = await expectValidResponse(
				await instanceA.dispatchFetch(
					`${BASE_URL}/local/email/routing?per_page=1`
				),
				zEmailListRoutingResponse,
				expect
			);
			expect(getListResult(firstPage.result)[0]).toMatchObject({
				worker: "churn-b",
				messageId: "<churn-b-1@example.com>",
			});
			const firstCursor = String(firstPage.result_info?.cursor);
			const firstState = decodeTestAggregateCursor(firstCursor);
			const peerState = Object.entries(firstState).find(
				([source]) => source !== "local"
			);
			if (peerState === undefined) {
				throw new Error("Expected a peer cursor");
			}
			expect(peerState[1]).toEqual(expect.any(String));
			expect(peerState[0]).toMatch(/^peer:/);

			await instanceB.setOptions(
				emailPeerOptions(registryPath, "churn-b", false)
			);
			await vi.waitFor(() => {
				expect(getWorkerRegistry(registryPath)["churn-b"]).toBeUndefined();
			});

			const secondPage = await expectValidResponse(
				await instanceA.dispatchFetch(
					`${BASE_URL}/local/email/routing?per_page=1&cursor=${encodeURIComponent(firstCursor)}`
				),
				zEmailListRoutingResponse,
				expect
			);
			expect(getListResult(secondPage.result)[0]).toMatchObject({
				worker: "churn-a",
				messageId: "<churn-a-2@example.com>",
			});
			const secondCursor = String(secondPage.result_info?.cursor);
			const secondState = decodeTestAggregateCursor(secondCursor);
			expect(secondState[peerState[0]]).toBe(peerState[1]);

			await instanceB.setOptions(optionsB);
			await waitForWorkersInRegistry(registryPath, ["churn-a", "churn-b"]);

			const thirdPage = await expectValidResponse(
				await instanceA.dispatchFetch(
					`${BASE_URL}/local/email/routing?per_page=1&cursor=${encodeURIComponent(secondCursor)}`
				),
				zEmailListRoutingResponse,
				expect
			);
			expect(getListResult(thirdPage.result)[0]).toMatchObject({
				worker: "churn-b",
				messageId: "<churn-b-0@example.com>",
			});
		} finally {
			await Promise.all([
				disposeWithRetry(instanceA),
				disposeWithRetry(instanceB),
			]);
			removeDirSync(registryPath);
		}
	});

	test("does not add a newly registered peer to an existing pagination run", async ({
		expect,
	}) => {
		const registryPath = mkdtempSync(path.join(tmpdir(), "mf-email-churn-"));
		const optionsA = emailPeerOptions(registryPath, "opening-a", true);
		const optionsB = emailPeerOptions(registryPath, "opening-b", false);
		const instanceA = new Miniflare(optionsA);
		const instanceB = new Miniflare(optionsB);

		try {
			await Promise.all([instanceA.ready, instanceB.ready]);
			await waitForWorkersInRegistry(registryPath, ["opening-a"]);
			for (let index = 0; index < 2; index++) {
				await storeReceivedEmail(instanceA, {
					worker: "opening-a",
					messageId: `<opening-a-${index}@example.com>`,
					subject: "Opening source",
					text: "Opening source",
				});
			}
			await storeReceivedEmail(instanceB, {
				worker: "opening-b",
				messageId: "<opening-b-0@example.com>",
				subject: "Opening source",
				text: "Opening source",
			});

			const firstPage = await expectValidResponse(
				await instanceA.dispatchFetch(
					`${BASE_URL}/local/email/routing?per_page=1`
				),
				zEmailListRoutingResponse,
				expect
			);
			expect(getListResult(firstPage.result)[0]?.messageId).toBe(
				"<opening-a-1@example.com>"
			);
			const cursor = String(firstPage.result_info?.cursor);

			await instanceB.setOptions(
				emailPeerOptions(registryPath, "opening-b", true)
			);
			await waitForWorkersInRegistry(registryPath, ["opening-a", "opening-b"]);

			const secondPage = await expectValidResponse(
				await instanceA.dispatchFetch(
					`${BASE_URL}/local/email/routing?per_page=1&cursor=${encodeURIComponent(cursor)}`
				),
				zEmailListRoutingResponse,
				expect
			);
			expect(getListResult(secondPage.result)[0]?.messageId).toBe(
				"<opening-a-0@example.com>"
			);
			expect(secondPage.result_info?.has_more).toBe(false);

			const freshPage = await expectValidResponse(
				await instanceA.dispatchFetch(
					`${BASE_URL}/local/email/routing?per_page=1`
				),
				zEmailListRoutingResponse,
				expect
			);
			expect(getListResult(freshPage.result)[0]).toMatchObject({
				worker: "opening-b",
				messageId: "<opening-b-0@example.com>",
			});
		} finally {
			await Promise.all([
				disposeWithRetry(instanceA),
				disposeWithRetry(instanceB),
			]);
			removeDirSync(registryPath);
		}
	});
});
