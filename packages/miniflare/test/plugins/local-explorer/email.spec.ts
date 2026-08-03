import { readFile } from "node:fs/promises";
import path from "node:path";
import { Miniflare } from "miniflare";
import dedent from "ts-dedent";
import { afterAll, beforeAll, describe, type ExpectStatic, test } from "vitest";
import { CorePaths } from "../../../src/workers/core/constants";
import {
	zEmailGetRoutingResponse,
	zEmailGetSendingResponse,
	zEmailListRoutingResponse,
	zEmailListSendingResponse,
	zEmailSendRoutingResponse,
} from "../../../src/workers/local-explorer/generated/zod.gen";
import { disposeWithRetry, TestLog } from "../../test-shared";
import { expectValidResponse } from "./helpers";

const BASE_URL = `http://localhost${CorePaths.EXPLORER}/api`;

// Worker with an email() handler. Forwards any message addressed to a
// "forward@" recipient and rejects any addressed to a "reject@" recipient so
// we can exercise the event capture.
const EMAIL_HANDLER_WORKER = dedent /* javascript */ `
	export default {
		fetch() {
			return new Response("user worker");
		},
		async email(message) {
			if (message.to.includes("reject@")) {
				message.setReject("blocked sender");
				return;
			}
			if (message.to.includes("forward@")) {
				await message.forward("forwarded@example.com");
			}
		},
	};
`;

// Worker that sends an email through a send_email binding using a
// MessageBuilder-style payload posted in the request body.
const SEND_EMAIL_WORKER = dedent /* javascript */ `
	export default {
		async fetch(request, env) {
			const builder = await request.json();
			await env.SEND_EMAIL.send(builder);
			return new Response("ok");
		},
	};
`;

describe("Email API - Routing", () => {
	let mf: Miniflare;

	beforeAll(async () => {
		mf = new Miniflare({
			inspectorPort: 0,
			compatibilityDate: "2025-03-17",
			modules: true,
			script: EMAIL_HANDLER_WORKER,
			unsafeLocalExplorer: true,
			unsafeTriggerHandlers: true,
		});
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	test("lists no received emails initially", async ({ expect }) => {
		const response = await mf.dispatchFetch(`${BASE_URL}/email/routing`);
		const data = await expectValidResponse(
			response,
			zEmailListRoutingResponse,
			expect
		);
		expect(data.result).toEqual([]);
	});

	test("delivers a test email and exposes it in the list and detail views", async ({
		expect,
	}) => {
		const sendResponse = await mf.dispatchFetch(
			`${BASE_URL}/email/routing/send`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					from: "sender@example.com",
					to: ["recipient@example.com"],
					subject: "Hello from the explorer",
					text: "This is a test email body.",
				}),
			}
		);
		const sendData = await expectValidResponse(
			sendResponse,
			zEmailSendRoutingResponse,
			expect
		);
		const sentMessageId = sendData.result?.messageId;
		expect(sentMessageId).toBeDefined();
		// The store is keyed by the Message-ID with its angle brackets stripped.
		const sentId = sentMessageId?.replace(/^<|>$/g, "");

		const listResponse = await mf.dispatchFetch(`${BASE_URL}/email/routing`);
		const data = await expectValidResponse(
			listResponse,
			zEmailListRoutingResponse,
			expect
		);
		// The Message-ID returned by the send must identify the stored email, so
		// the caller can reference the delivered message directly.
		const stored = data.result?.find((e) => e.messageId === sentMessageId);
		expect(stored).toEqual(
			expect.objectContaining({
				from: "sender@example.com",
				to: "recipient@example.com",
				subject: "Hello from the explorer",
			})
		);
		// And the detail endpoint must resolve that same email, exposing the raw
		// MIME and the handling path the list view omits.
		const detailResponse = await mf.dispatchFetch(
			`${BASE_URL}/email/routing/${sentId}`
		);
		const detail = await expectValidResponse(
			detailResponse,
			zEmailGetRoutingResponse,
			expect
		);
		expect(detail.result?.messageId).toBe(sentMessageId);
		expect(detail.result?.raw).toContain("Subject: Hello from the explorer");
		expect(detail.result?.rawBase64).toBeDefined();
		expect(
			Buffer.from(detail.result?.rawBase64 ?? "", "base64").toString("utf8")
		).toContain("Subject: Hello from the explorer");
		expect(detail.result?.events[0]?.type).toBe("received");

		// The synthesized Message-ID follows mimetext's shape: a base36 random id
		// plus the sender's domain, wrapped in angle brackets.
		expect(detail.result?.raw).toContain(`Message-ID: ${sentMessageId}`);
		expect(sentMessageId).toMatch(/^<[a-z0-9]+@example\.com>$/);
	});

	test("uses a caller-supplied Message-ID as the id", async ({ expect }) => {
		const messageId = "<explicit-id@sender.example.com>";
		const sendResponse = await mf.dispatchFetch(
			`${BASE_URL}/email/routing/send`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					from: "sender@example.com",
					to: ["recipient@example.com"],
					subject: "Explicit id",
					text: "body",
					headers: { "message-id": messageId },
				}),
			}
		);
		const sendData = await expectValidResponse(
			sendResponse,
			zEmailSendRoutingResponse,
			expect
		);
		expect(sendData.result?.messageId).toBe(messageId);

		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/email/routing/${sendData.result?.messageId?.replace(/^<|>$/g, "")}`
			),
			zEmailGetRoutingResponse,
			expect
		);
		expect(detail.result?.messageId).toBe(messageId);
		// The supplied header must not be emitted twice alongside a synthesized one.
		expect(detail.result?.raw?.match(/^Message-ID:/gim)).toHaveLength(1);
	});

	test("records a forwarded event", async ({ expect }) => {
		const sendResponse = await mf.dispatchFetch(
			`${BASE_URL}/email/routing/send`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					from: "sender@example.com",
					to: ["forward@example.com"],
					subject: "Please forward me",
					text: "body",
				}),
			}
		);
		await sendResponse.text();

		const listResponse = await mf.dispatchFetch(`${BASE_URL}/email/routing`);
		const list = await expectValidResponse(
			listResponse,
			zEmailListRoutingResponse,
			expect
		);
		const forwarded = list.result?.find((e) => e.to === "forward@example.com");
		expect(forwarded).toBeDefined();
		expect(forwarded?.events.map((event) => event.type)).toContain("forward");
		// The forward's full payload is available on the message, correlated by id.
		expect(forwarded?.forwards).toEqual([
			{
				recipient: "forwarded@example.com",
				headers: [],
				// Synthesized in mimetext's shape, using the recipient's domain:
				// `<{base36 random}@{domain}>`.
				messageId: expect.stringMatching(/^<[a-z0-9]+@example\.com>$/),
			},
		]);
	});

	test("a rejected test email still succeeds and reports the reason", async ({
		expect,
	}) => {
		const sendResponse = await mf.dispatchFetch(
			`${BASE_URL}/email/routing/send`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					from: "sender@example.com",
					to: ["reject@example.com"],
					subject: "Please reject me",
					text: "body",
				}),
			}
		);
		// A handler that rejects the message is not a send failure: the message was
		// delivered to the handler, which chose to reject it.
		const sendData = await expectValidResponse(
			sendResponse,
			zEmailSendRoutingResponse,
			expect
		);
		expect(sendData.result?.outcome).toBe("ok");
		expect(sendData.result?.rejectReason).toBe("blocked sender");

		const listResponse = await mf.dispatchFetch(`${BASE_URL}/email/routing`);
		const list = await expectValidResponse(
			listResponse,
			zEmailListRoutingResponse,
			expect
		);
		const rejected = list.result?.find((e) => e.to === "reject@example.com");
		expect(rejected?.rejectReason).toBe("blocked sender");
		expect(rejected?.events.map((event) => event.type)).toEqual([
			"received",
			"reject",
		]);
	});

	test("returns 404 for an unknown email", async ({ expect }) => {
		const response = await mf.dispatchFetch(
			`${BASE_URL}/email/routing/does-not-exist`
		);
		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({
			success: false,
			errors: [expect.objectContaining({ code: 10601 })],
		});
	});
});

describe("Email API - Routing attachments", () => {
	let mf: Miniflare;

	beforeAll(async () => {
		mf = new Miniflare({
			inspectorPort: 0,
			compatibilityDate: "2025-03-17",
			modules: true,
			script: EMAIL_HANDLER_WORKER,
			unsafeLocalExplorer: true,
			unsafeTriggerHandlers: true,
		});
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	/** Sends a test email and returns the stored record the explorer exposes. */
	async function sendAndReadDetail(
		body: Record<string, unknown>,
		expect: ExpectStatic
	) {
		const sendResponse = await mf.dispatchFetch(
			`${BASE_URL}/email/routing/send`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			}
		);
		const sendData = await expectValidResponse(
			sendResponse,
			zEmailSendRoutingResponse,
			expect
		);
		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/email/routing/${sendData.result?.messageId?.replace(/^<|>$/g, "")}`
			),
			zEmailGetRoutingResponse,
			expect
		);
		return detail.result;
	}

	/** Sends a test email and returns the raw MIME the worker received. */
	async function sendAndReadRaw(
		body: Record<string, unknown>,
		expect: ExpectStatic
	): Promise<string> {
		return (await sendAndReadDetail(body, expect))?.raw ?? "";
	}

	test("rejects MIME header injection and invalid base64", async ({
		expect,
	}) => {
		const injected = await mf.dispatchFetch(`${BASE_URL}/email/routing/send`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				from: "sender@example.com",
				to: ["recipient@example.com"],
				subject: "bad\r\nX-Injected: yes",
			}),
		});
		expect(injected.status).toBe(400);
		await injected.text();

		const invalidBase64 = await mf.dispatchFetch(
			`${BASE_URL}/email/routing/send`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					from: "sender@example.com",
					to: ["recipient@example.com"],
					subject: "bad attachment",
					attachments: [
						{
							filename: "bad.txt",
							type: "text/plain",
							content: "not-base64",
						},
					],
				}),
			}
		);
		expect(invalidBase64.status).toBe(400);
		await invalidBase64.text();
	});

	test("composes an attachment into a multipart/mixed message", async ({
		expect,
	}) => {
		const content = Buffer.from("Hello, attachment!").toString("base64");
		const raw = await sendAndReadRaw(
			{
				from: "sender@example.com",
				to: ["recipient@example.com"],
				subject: "With attachment",
				text: "See attached.",
				attachments: [{ filename: "notes.txt", type: "text/plain", content }],
			},
			expect
		);

		expect(raw).toContain("Content-Type: multipart/mixed; boundary=");
		// The body survives alongside the attachment rather than being replaced.
		expect(raw).toContain("See attached.");
		expect(raw).toContain('Content-Type: text/plain; name="notes.txt"');
		expect(raw).toContain(
			'Content-Disposition: attachment; filename="notes.txt"'
		);
		expect(raw).toContain("Content-Transfer-Encoding: base64");
		expect(raw).toContain(content);
	});

	test("supports zero-byte attachments", async ({ expect }) => {
		const detail = await sendAndReadDetail(
			{
				from: "sender@example.com",
				to: ["recipient@example.com"],
				subject: "Empty attachment",
				attachments: [
					{
						filename: "empty.txt",
						type: "text/plain",
						content: "",
					},
				],
			},
			expect
		);
		expect(detail?.attachments).toEqual([
			{
				filename: "empty.txt",
				contentType: "text/plain",
				disposition: "attachment",
				size: 0,
			},
		]);
	});

	test("supports multiple attachments and inline disposition", async ({
		expect,
	}) => {
		const raw = await sendAndReadRaw(
			{
				from: "sender@example.com",
				to: ["recipient@example.com"],
				subject: "Two attachments",
				text: "body",
				attachments: [
					{
						filename: "a.txt",
						type: "text/plain",
						content: Buffer.from("first").toString("base64"),
					},
					{
						filename: "logo.png",
						type: "image/png",
						content: Buffer.from("second").toString("base64"),
						contentId: "logo@example.com",
						disposition: "inline",
					},
				],
			},
			expect
		);

		expect(raw).toContain('Content-Disposition: attachment; filename="a.txt"');
		expect(raw).toContain('Content-Type: image/png; name="logo.png"');
		expect(raw).toContain('Content-Disposition: inline; filename="logo.png"');
		expect(raw).toContain("Content-ID: <logo@example.com>");
	});

	test("keeps an html and text body as multipart/alternative alongside attachments", async ({
		expect,
	}) => {
		const raw = await sendAndReadRaw(
			{
				from: "sender@example.com",
				to: ["recipient@example.com"],
				subject: "Alternative plus attachment",
				text: "plain body",
				html: "<p>html body</p>",
				attachments: [
					{
						filename: "a.txt",
						type: "text/plain",
						content: Buffer.from("first").toString("base64"),
					},
				],
			},
			expect
		);

		// The alternative body is nested inside the mixed container, so both
		// representations of the body and the attachment all survive.
		expect(raw).toContain("Content-Type: multipart/mixed; boundary=");
		expect(raw).toContain("Content-Type: multipart/alternative; boundary=");
		expect(raw).toContain("plain body");
		expect(raw).toContain("<p>html body</p>");
		expect(raw).toContain('filename="a.txt"');
	});

	test("wraps long attachment content at the MIME line limit", async ({
		expect,
	}) => {
		// Base64 lines longer than 76 characters are invalid per RFC 2045 and can
		// be rejected or truncated by parsers.
		const content = Buffer.from("a".repeat(500)).toString("base64");
		expect(content.length).toBeGreaterThan(76);

		const raw = await sendAndReadRaw(
			{
				from: "sender@example.com",
				to: ["recipient@example.com"],
				subject: "Long attachment",
				text: "body",
				attachments: [
					{
						filename: "big.bin",
						type: "application/octet-stream",
						content,
					},
				],
			},
			expect
		);

		const base64Lines = raw
			.split(/\r?\n/)
			.filter((line) => /^[A-Za-z0-9+/]+={0,2}$/.test(line));
		expect(base64Lines.length).toBeGreaterThan(1);
		for (const line of base64Lines) {
			expect(line.length).toBeLessThanOrEqual(76);
		}
		// The content is still recoverable once the line wrapping is undone.
		expect(raw.replace(/\r?\n/g, "")).toContain(content);
	});

	test("escapes quotes in attachment filenames", async ({ expect }) => {
		const raw = await sendAndReadRaw(
			{
				from: "sender@example.com",
				to: ["recipient@example.com"],
				subject: "Quoted filename",
				text: "body",
				attachments: [
					{
						filename: 'we"ird.txt',
						type: "text/plain",
						content: Buffer.from("x").toString("base64"),
					},
				],
			},
			expect
		);

		// An unescaped quote would terminate the filename parameter early.
		expect(raw).toContain('filename="we\\"ird.txt"');
	});

	test("omits multipart framing when there are no attachments", async ({
		expect,
	}) => {
		const detail = await sendAndReadDetail(
			{
				from: "sender@example.com",
				to: ["recipient@example.com"],
				subject: "No attachments",
				text: "just text",
			},
			expect
		);

		const raw = detail?.raw ?? "";
		expect(raw).not.toContain("multipart/mixed");
		expect(raw).toContain("Content-Type: text/plain; charset=utf-8");
		expect(raw).toContain("just text");
		expect(detail?.attachments).toEqual([]);
	});

	// The explorer surfaces attachment metadata for received emails so they can
	// be listed in the UI. The content itself stays in `raw`.
	test("exposes metadata for attachments parsed off the received message", async ({
		expect,
	}) => {
		const detail = await sendAndReadDetail(
			{
				from: "sender@example.com",
				to: ["recipient@example.com"],
				subject: "Metadata check",
				text: "See attached.",
				attachments: [
					{
						filename: "invoice.pdf",
						type: "application/pdf",
						content: Buffer.from("%PDF-1.4 pretend pdf").toString("base64"),
					},
					{
						filename: "logo.png",
						type: "image/png",
						content: Buffer.from("pretend png").toString("base64"),
						disposition: "inline",
					},
				],
			},
			expect
		);

		expect(detail?.attachments).toEqual([
			{
				filename: "invoice.pdf",
				contentType: "application/pdf",
				disposition: "attachment",
				// Byte length of the decoded content, not the base64 payload.
				size: "%PDF-1.4 pretend pdf".length,
			},
			{
				filename: "logo.png",
				contentType: "image/png",
				disposition: "inline",
				size: "pretend png".length,
			},
		]);
	});
});

describe("Email API - Routing without an email() handler", () => {
	let mf: Miniflare;

	beforeAll(async () => {
		mf = new Miniflare({
			inspectorPort: 0,
			compatibilityDate: "2025-03-17",
			modules: true,
			// No email() handler exported.
			script: `export default { fetch() { return new Response("user worker"); } };`,
			unsafeLocalExplorer: true,
			unsafeTriggerHandlers: true,
		});
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	test("still records the message, marked as unhandled", async ({ expect }) => {
		// Sending succeeds even though the message cannot be delivered.
		const sendResponse = await mf.dispatchFetch(
			`${BASE_URL}/email/routing/send`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					from: "sender@example.com",
					to: ["recipient@example.com"],
					subject: "Undeliverable",
					text: "body",
				}),
			}
		);
		await expectValidResponse(sendResponse, zEmailSendRoutingResponse, expect);

		const response = await mf.dispatchFetch(`${BASE_URL}/email/routing`);
		const data = await expectValidResponse(
			response,
			zEmailListRoutingResponse,
			expect
		);
		expect(data.result).toHaveLength(1);
		const email = data.result?.[0];
		expect(email?.subject).toBe("Undeliverable");

		const detail = await mf.dispatchFetch(
			`${BASE_URL}/email/routing/${email?.messageId?.replace(/^<|>$/g, "")}`
		);
		const detailData = await expectValidResponse(
			detail,
			zEmailGetRoutingResponse,
			expect
		);
		expect(detailData.result?.events.map((e) => e.type)).toEqual(["unhandled"]);
		expect(detailData.result?.outcome).toBe("exception");
	});
});

// Worker whose email() handler replies to the incoming message. The reply is
// written to disk, letting us assert the on-disk filename matches the routing
// id the message is logged under in the explorer.
const REPLY_EMAIL_WORKER = dedent /* javascript */ `
	import { EmailMessage } from "cloudflare:email";

	const REPLY = [
		"From: someone else <someone-else@example.com>",
		"To: someone <someone@example.com>",
		"MIME-Version: 1.0",
		"Content-Type: text/plain",
		"In-Reply-To: <im-a-random-parent-message-id@example.com>",
		"Message-ID: <im-a-random-reply-message-id@example.com>",
		// A MIME "encoded-word" subject (base64 of "An email generated in a Worker"),
		// as produced by libraries like mimetext. The explorer should show it decoded.
		"Subject: =?utf-8?B?QW4gZW1haWwgZ2VuZXJhdGVkIGluIGEgV29ya2Vy?=",
		"",
		"This is a reply.",
	].join("\\n");

	export default {
		fetch() {
			return new Response("user worker");
		},
		async email(message) {
			await message.reply(
				new EmailMessage(message.to, message.from, REPLY)
			);
		},
	};
`;

describe("Email API - Routing reply file correlation", () => {
	let mf: Miniflare;
	let log: TestLog;

	beforeAll(async () => {
		log = new TestLog();
		mf = new Miniflare({
			log,
			handleStructuredLogs({ message }: { message: string }) {
				log.info(message);
			},
			inspectorPort: 0,
			compatibilityDate: "2025-03-17",
			modules: true,
			script: REPLY_EMAIL_WORKER,
			unsafeLocalExplorer: true,
			unsafeTriggerHandlers: true,
		});
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	test("reply is saved to disk under its own message id", async ({
		expect,
	}) => {
		const email = dedent`
			From: someone <someone@example.com>
			To: someone else <someone-else@example.com>
			Message-ID: <im-a-random-parent-message-id@example.com>
			MIME-Version: 1.0
			Content-Type: text/plain

			This is a random email body.`;

		const res = await mf.dispatchFetch(
			"http://localhost/cdn-cgi/handler/email?" +
				new URLSearchParams({
					from: "someone@example.com",
					to: "someone-else@example.com",
				}).toString(),
			{ body: email, method: "POST" }
		);
		expect(await res.text()).toBe("Worker successfully processed email");

		// The reply handler logs the path of the reply file it wrote to disk.
		const replyLog = log.logs.find(([, message]) =>
			message.startsWith("Email handler replied to sender")
		);
		expect(replyLog).toBeDefined();
		const filePath = replyLog?.[1].match(/^ {2}(.+)$/m)?.[1];
		expect(filePath).toBeDefined();
		// File must exist and its basename (minus extension) is the id used on disk.
		const fileContent = await readFile(String(filePath), "utf-8");
		expect(fileContent).toBeTruthy();
		const fileId = path.basename(String(filePath), ".eml");

		// Replies are grouped under `.../email/<session-id>/reply/<id>.eml`.
		expect(path.basename(path.dirname(String(filePath)))).toBe("reply");

		// The same message must be logged in the explorer's routing inbox.
		const listResponse = await mf.dispatchFetch(`${BASE_URL}/email/routing`);
		const list = await expectValidResponse(
			listResponse,
			zEmailListRoutingResponse,
			expect
		);
		const routed = list.result?.find(
			(e) => e.messageId === "<im-a-random-parent-message-id@example.com>"
		);
		expect(routed).toBeDefined();
		// The reply event is recorded, but the inbox list omits the (potentially
		// large) reply raw...
		expect(routed?.events.map((e) => e.type)).toContain("reply");
		const listedReply = routed?.replies[0];
		expect(listedReply).toBeDefined();
		expect(listedReply?.sender).toBe("someone-else@example.com");
		expect(listedReply?.raw).toBeUndefined();

		// ...but the detail view exposes it, so the reply can be shown when the
		// "Reply" event is clicked/expanded in the explorer.
		const detailResponse = await mf.dispatchFetch(
			`${BASE_URL}/email/routing/${routed?.messageId?.replace(/^<|>$/g, "")}`
		);
		const detail = await expectValidResponse(
			detailResponse,
			zEmailGetRoutingResponse,
			expect
		);
		const detailReply = detail.result?.replies[0];
		expect(detailReply?.messageId?.replace(/^<|>$/g, "")).toBe(fileId);
		expect(detailReply?.raw).toContain("This is a reply.");
		// The reply's MIME encoded-word subject must be surfaced decoded, not raw.
		expect(detailReply?.raw).toContain(
			"Subject: An email generated in a Worker"
		);
		expect(detailReply?.raw).not.toContain("=?utf-8?B?");
		// The reply's Message-ID is preserved from the worker's raw email.
		expect(detailReply?.raw).toContain(
			"Message-ID: <im-a-random-reply-message-id@example.com>"
		);
	});
});

describe("Email API - Sending", () => {
	let mf: Miniflare;

	beforeAll(async () => {
		mf = new Miniflare({
			inspectorPort: 0,
			compatibilityDate: "2025-03-17",
			modules: true,
			script: SEND_EMAIL_WORKER,
			email: {
				send_email: [{ name: "SEND_EMAIL" }],
			},
			unsafeLocalExplorer: true,
		});
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	test("lists no sent emails initially", async ({ expect }) => {
		const response = await mf.dispatchFetch(`${BASE_URL}/email/sending`);
		const data = await expectValidResponse(
			response,
			zEmailListSendingResponse,
			expect
		);
		expect(data.result).toEqual([]);
	});

	test("captures an email sent through a send_email binding and exposes its details", async ({
		expect,
	}) => {
		const sendResponse = await mf.dispatchFetch("http://localhost", {
			method: "POST",
			body: JSON.stringify({
				from: "sender@example.com",
				to: "recipient@example.com",
				subject: "Sent via binding",
				text: "Hello from the worker",
			}),
		});
		expect(await sendResponse.text()).toBe("ok");

		const listResponse = await mf.dispatchFetch(`${BASE_URL}/email/sending`);
		const data = await expectValidResponse(
			listResponse,
			zEmailListSendingResponse,
			expect
		);
		expect(data.result).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					from: "sender@example.com",
					subject: "Sent via binding",
				}),
			])
		);
		const listed = data.result?.[0];
		expect(listed?.to).toContain("recipient@example.com");

		// The list view omits the body, so the detail endpoint must expose it.
		const detailResponse = await mf.dispatchFetch(
			`${BASE_URL}/email/sending/${listed?.messageId?.replace(/^<|>$/g, "")}`
		);
		const detail = await expectValidResponse(
			detailResponse,
			zEmailGetSendingResponse,
			expect
		);
		expect(detail.result?.text).toBe("Hello from the worker");
	});

	test("returns 404 for an unknown email", async ({ expect }) => {
		const response = await mf.dispatchFetch(
			`${BASE_URL}/email/sending/does-not-exist`
		);
		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({
			success: false,
			errors: [expect.objectContaining({ code: 10601 })],
		});
	});

	test("lists sent emails newest-first", async ({ expect }) => {
		const subjects = ["ordering-1", "ordering-2", "ordering-3"];
		for (const subject of subjects) {
			const res = await mf.dispatchFetch("http://localhost", {
				method: "POST",
				body: JSON.stringify({
					from: "sender@example.com",
					to: "recipient@example.com",
					subject,
					text: subject,
				}),
			});
			expect(await res.text()).toBe("ok");
		}

		const listResponse = await mf.dispatchFetch(`${BASE_URL}/email/sending`);
		const data = await expectValidResponse(
			listResponse,
			zEmailListSendingResponse,
			expect
		);
		// The store returns records newest-first, so the three most recent sends
		// appear in reverse insertion order.
		const listedSubjects = (data.result ?? []).map((email) => email.subject);
		expect(listedSubjects.slice(0, 3)).toEqual([
			"ordering-3",
			"ordering-2",
			"ordering-1",
		]);
	});
});

// Email capture is stored per-`Miniflare` instance. Two instances running in the
// same process must not see each other's emails (regression test for a former
// module-global store).
describe("Email API - per-instance isolation", () => {
	let mfA: Miniflare;
	let mfB: Miniflare;

	beforeAll(async () => {
		mfA = new Miniflare({
			inspectorPort: 0,
			compatibilityDate: "2025-03-17",
			modules: true,
			script: EMAIL_HANDLER_WORKER,
			unsafeLocalExplorer: true,
			unsafeTriggerHandlers: true,
		});
		mfB = new Miniflare({
			inspectorPort: 0,
			compatibilityDate: "2025-03-17",
			modules: true,
			script: EMAIL_HANDLER_WORKER,
			unsafeLocalExplorer: true,
			unsafeTriggerHandlers: true,
		});
	});

	afterAll(async () => {
		await Promise.all([disposeWithRetry(mfA), disposeWithRetry(mfB)]);
	});

	test("one instance's emails are not visible to another", async ({
		expect,
	}) => {
		const sendResponse = await mfA.dispatchFetch(
			`${BASE_URL}/email/routing/send`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					from: "sender@example.com",
					to: ["recipient@example.com"],
					subject: "Only in A",
					text: "body",
				}),
			}
		);
		await sendResponse.text();

		const listA = await expectValidResponse(
			await mfA.dispatchFetch(`${BASE_URL}/email/routing`),
			zEmailListRoutingResponse,
			expect
		);
		const listB = await expectValidResponse(
			await mfB.dispatchFetch(`${BASE_URL}/email/routing`),
			zEmailListRoutingResponse,
			expect
		);

		expect(listA.result).toHaveLength(1);
		expect(listA.result?.[0]?.subject).toBe("Only in A");
		// B captured nothing, so it must not see A's email.
		expect(listB.result).toEqual([]);
	});
});
