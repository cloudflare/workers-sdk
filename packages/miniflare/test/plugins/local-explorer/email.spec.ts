import { mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { Miniflare } from "miniflare";
import dedent from "ts-dedent";
import { afterAll, beforeAll, describe, type ExpectStatic, test } from "vitest";
import { CorePaths } from "../../../src/workers/core/constants";
import { messageIdToStorageId } from "../../../src/workers/email/message-id";
import {
	zEmailGetRoutingResponse,
	zEmailGetSendingResponse,
	zEmailListRoutingResponse,
	zEmailListSendingResponse,
	zEmailSendRoutingResponse,
} from "../../../src/workers/local-explorer/generated/zod.gen";
import {
	disposeWithRetry,
	TestLog,
	waitForWorkersInRegistry,
} from "../../test-shared";
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
	import { EmailMessage } from "cloudflare:email";

	export default {
		async fetch(request, env) {
			if (new URL(request.url).pathname === "/legacy") {
				await env.SEND_EMAIL.send(
					new EmailMessage(
						"sender@example.com",
						"recipient@example.com",
						request.body
					)
				);
				return new Response("ok");
			}
			const builder = await request.json();
			await env.SEND_EMAIL.send(builder);
			return new Response("ok");
		},
	};
`;

// Worker that both receives (email() handler) and sends (send_email binding),
// used to exercise per-worker filtering when several workers run together.
const EMAIL_ROUNDTRIP_WORKER = dedent /* javascript */ `
	export default {
		async fetch(request, env) {
			const builder = await request.json();
			await env.SEND_EMAIL.send(builder);
			return new Response("ok");
		},
		async email(message) {},
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

	// The composed MIME is capped at the 1 MiB local-dev limit before it is
	// delivered to the handler, so an oversized test email is rejected as a send
	// failure rather than reaching the worker.
	test("rejects a test email larger than the 1 MiB local limit", async ({
		expect,
	}) => {
		const response = await mf.dispatchFetch(`${BASE_URL}/email/routing/send`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				from: "sender@example.com",
				to: ["recipient@example.com"],
				subject: "too big",
				// Comfortably over 1 MiB once composed into MIME.
				text: "a".repeat(1024 * 1024 + 1024),
			}),
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			success: false,
			errors: [
				expect.objectContaining({
					code: 10602,
					message: expect.stringContaining("1 MiB local development limit"),
				}),
			],
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
		// A control character in a header field is rejected with the control-char
		// message, distinct from the attachment failure below.
		expect(await injected.json()).toMatchObject({
			success: false,
			errors: [
				expect.objectContaining({
					code: 10000,
					message: expect.stringContaining("control characters"),
				}),
			],
		});

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
		// Non-base64 attachment content is rejected with the attachment message,
		// so a regression that swapped the two validations would be caught.
		expect(await invalidBase64.json()).toMatchObject({
			success: false,
			errors: [
				expect.objectContaining({
					code: 10000,
					message: expect.stringContaining(
						"valid filenames, MIME types, and base64 content"
					),
				}),
			],
		});
	});

	test("composes an attachment into a multipart/mixed message", async ({
		expect,
	}) => {
		const content = Buffer.from("Hello, attachment!").toString("base64");
		const raw = await sendAndReadRaw(
			{
				from: "sender@example.com",
				to: ["recipient@example.com"],
				bcc: ["hidden@example.com"],
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
		expect(raw).not.toContain("Bcc:");
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
			"http://localhost/cdn-cgi/local/email?" +
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
		expect(
			detailReply?.messageId === undefined
				? undefined
				: messageIdToStorageId(detailReply.messageId)
		).toBe(fileId);
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

	test("escapes control characters in email warning logs", async ({
		expect,
	}) => {
		const response = await mf.dispatchFetch(
			`http://localhost${CorePaths.EMAIL}?${new URLSearchParams({
				from: "attacker@example.com\nInjected: yes",
				to: "someone-else@example.com",
			}).toString()}`,
			{
				method: "POST",
				body: dedent`
					From: someone@example.com
					To: someone-else@example.com
					Message-ID: <log-escape@example.com>
					MIME-Version: 1.0
					Content-Type: text/plain

					body`,
			}
		);

		await response.text();
		const warning = log.logs.find(([, message]) =>
			message.includes("MAIL FROM address")
		);
		expect(warning?.[1]).toContain("\\x0a");
		expect(warning?.[1]).not.toContain("attacker@example.com\nInjected");
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

	test("captures legacy EmailMessage headers in the sending detail", async ({
		expect,
	}) => {
		const response = await mf.dispatchFetch("http://localhost/legacy", {
			method: "POST",
			body: [
				"From: sender@example.com",
				"To: recipient@example.com",
				"Cc: copy@example.com",
				"Reply-To: replies@example.com",
				"Message-ID: <legacy-metadata@example.com>",
				"X-Test: preserved",
				"Content-Type: text/plain",
				"",
				"Legacy message",
			].join("\r\n"),
		});
		expect(await response.text()).toBe("ok");

		const listResponse = await mf.dispatchFetch(`${BASE_URL}/email/sending`);
		const list = await expectValidResponse(
			listResponse,
			zEmailListSendingResponse,
			expect
		);
		const listed = list.result?.find(
			(email) => email.messageId === "<legacy-metadata@example.com>"
		);
		expect(listed).toBeDefined();

		const detailResponse = await mf.dispatchFetch(
			`${BASE_URL}/email/sending/legacy-metadata@example.com`
		);
		const detail = await expectValidResponse(
			detailResponse,
			zEmailGetSendingResponse,
			expect
		);
		expect(detail.result).toMatchObject({
			cc: ["copy@example.com"],
			replyTo: "replies@example.com",
			headers: expect.objectContaining({ "x-test": "preserved" }),
		});
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

// Multiple workers can run inside one Miniflare instance. The Email tab filters
// its inboxes by the selected worker (the `?worker` query param), so each
// worker only ever sees its own received and sent emails.
describe("Email API - multiple workers on one instance", () => {
	let mf: Miniflare;

	beforeAll(async () => {
		mf = new Miniflare({
			inspectorPort: 0,
			compatibilityDate: "2025-03-17",
			unsafeLocalExplorer: true,
			unsafeTriggerHandlers: true,
			workers: [
				{
					name: "worker-a",
					modules: true,
					script: EMAIL_ROUNDTRIP_WORKER,
					email: { send_email: [{ name: "SEND_EMAIL" }] },
					routes: ["worker-a.example.com/*"],
				},
				{
					name: "worker-b",
					modules: true,
					script: EMAIL_ROUNDTRIP_WORKER,
					email: { send_email: [{ name: "SEND_EMAIL" }] },
					routes: ["worker-b.example.com/*"],
				},
			],
		});
		await mf.ready;
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	test("routing inbox only shows emails for the selected worker", async ({
		expect,
	}) => {
		// Deliver one test email to each worker via the `?worker` param.
		for (const worker of ["worker-a", "worker-b"]) {
			const sendResponse = await mf.dispatchFetch(
				`${BASE_URL}/email/routing/send?worker=${worker}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						from: "sender@example.com",
						to: ["recipient@example.com"],
						subject: `to ${worker}`,
						text: "body",
					}),
				}
			);
			await expectValidResponse(
				sendResponse,
				zEmailSendRoutingResponse,
				expect
			);
		}

		const listA = await expectValidResponse(
			await mf.dispatchFetch(`${BASE_URL}/email/routing?worker=worker-a`),
			zEmailListRoutingResponse,
			expect
		);
		const listB = await expectValidResponse(
			await mf.dispatchFetch(`${BASE_URL}/email/routing?worker=worker-b`),
			zEmailListRoutingResponse,
			expect
		);

		expect(listA.result).toHaveLength(1);
		expect(listA.result?.[0]).toEqual(
			expect.objectContaining({ worker: "worker-a", subject: "to worker-a" })
		);
		expect(listB.result).toHaveLength(1);
		expect(listB.result?.[0]).toEqual(
			expect.objectContaining({ worker: "worker-b", subject: "to worker-b" })
		);
	});

	test("an unfiltered routing list still shows every worker's emails", async ({
		expect,
	}) => {
		// Omitting `?worker` preserves the previous, single-worker behaviour: the
		// list is not narrowed and shows messages for all workers.
		const listAll = await expectValidResponse(
			await mf.dispatchFetch(`${BASE_URL}/email/routing`),
			zEmailListRoutingResponse,
			expect
		);
		const workers = new Set(
			(listAll.result ?? []).map((email) => email.worker)
		);
		expect(workers).toEqual(new Set(["worker-a", "worker-b"]));
	});

	test("attributes routed emails to the resolved worker", async ({
		expect,
	}) => {
		const messageId = "<routed-worker@example.com>";
		const raw = dedent`
			From: sender@example.com
			To: recipient@example.com
			Message-ID: ${messageId}
			MIME-Version: 1.0
			Content-Type: text/plain

			body`;
		const response = await mf.dispatchFetch(
			`http://worker-a.example.com${CorePaths.EMAIL}?${new URLSearchParams({
				from: "sender@example.com",
				to: "recipient@example.com",
				worker: "worker-b",
			}).toString()}`,
			{ method: "POST", body: raw }
		);

		expect(await response.text()).toBe("Worker successfully processed email");
		const listA = await expectValidResponse(
			await mf.dispatchFetch(`${BASE_URL}/email/routing?worker=worker-a`),
			zEmailListRoutingResponse,
			expect
		);
		const routed = listA.result?.find((email) => email.messageId === messageId);
		expect(routed?.worker).toBe("worker-a");
	});
});

// Regression for "No entrypoint worker found": under `wrangler dev`, the user
// workers live inside an inner Miniflare instance behind wrangler's outer
// ProxyWorker, so the instance's public URL points at an entry that does not
// know the user worker names. Setting `publicUrl` to an unrelated address
// reproduces that topology. "Send Test Email" must still reach the selected
// worker's email() handler by invoking its direct service binding, rather than
// routing the delivery back through the (wrong) public entry.
describe("Email API - send with a public URL that can't route to workers", () => {
	let mf: Miniflare;

	beforeAll(async () => {
		mf = new Miniflare({
			inspectorPort: 0,
			compatibilityDate: "2025-03-17",
			unsafeLocalExplorer: true,
			unsafeTriggerHandlers: true,
			// Simulate wrangler's outer proxy: a public URL that does not front
			// this instance's user workers.
			publicUrl: "http://proxy.invalid:9999",
			workers: [
				{
					name: "worker-a",
					modules: true,
					script: EMAIL_ROUNDTRIP_WORKER,
					email: { send_email: [{ name: "SEND_EMAIL" }] },
				},
				{
					name: "worker-b",
					modules: true,
					script: EMAIL_ROUNDTRIP_WORKER,
					email: { send_email: [{ name: "SEND_EMAIL" }] },
				},
			],
		});
		await mf.ready;
	});

	afterAll(async () => {
		await disposeWithRetry(mf);
	});

	test("delivers to the selected worker without hitting the public URL", async ({
		expect,
	}) => {
		const sendResponse = await mf.dispatchFetch(
			`${BASE_URL}/email/routing/send?worker=worker-b`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					from: "sender@example.com",
					to: ["recipient@example.com"],
					subject: "to worker-b",
					text: "body",
				}),
			}
		);
		const sent = await expectValidResponse(
			sendResponse,
			zEmailSendRoutingResponse,
			expect
		);
		// The handler ran successfully — not a "No entrypoint worker found" 4xx.
		expect(sent.result?.outcome).toBe("ok");

		const listB = await expectValidResponse(
			await mf.dispatchFetch(`${BASE_URL}/email/routing?worker=worker-b`),
			zEmailListRoutingResponse,
			expect
		);
		expect(listB.result).toHaveLength(1);
		expect(listB.result?.[0]).toEqual(
			expect.objectContaining({ worker: "worker-b", subject: "to worker-b" })
		);
	});
});

// Workers can also be spread across separate Miniflare instances that share a
// dev registry. Selecting a peer worker must surface its emails and route a test
// email to it, via cross-instance aggregation.
describe("Email API - workers across instances", () => {
	let registryPath: string;
	let instanceA: Miniflare;
	let instanceB: Miniflare;

	beforeAll(async () => {
		registryPath = mkdtempSync(path.join(tmpdir(), "mf-email-registry-"));

		instanceA = new Miniflare({
			name: "worker-a",
			inspectorPort: 0,
			compatibilityDate: "2025-03-17",
			modules: true,
			script: EMAIL_HANDLER_WORKER,
			email: { send_email: [{ name: "SEND_EMAIL" }] },
			unsafeLocalExplorer: true,
			unsafeTriggerHandlers: true,
			unsafeDevRegistryPath: registryPath,
		});
		instanceB = new Miniflare({
			name: "worker-b",
			inspectorPort: 0,
			compatibilityDate: "2025-03-17",
			modules: true,
			script: SEND_EMAIL_WORKER,
			email: { send_email: [{ name: "SEND_EMAIL" }] },
			unsafeLocalExplorer: true,
			unsafeTriggerHandlers: true,
			unsafeDevRegistryPath: registryPath,
		});
		await instanceA.ready;
		await instanceB.ready;
		await waitForWorkersInRegistry(registryPath, ["worker-a", "worker-b"]);
	});

	afterAll(async () => {
		await Promise.all([
			disposeWithRetry(instanceA),
			disposeWithRetry(instanceB),
		]);
		removeDirSync(registryPath);
	});

	test("a peer worker's sent emails are visible when it is selected", async ({
		expect,
	}) => {
		// worker-b (on instance B) sends an email through its send_email binding.
		const res = await instanceB.dispatchFetch("http://localhost", {
			method: "POST",
			body: JSON.stringify({
				from: "sender@example.com",
				to: "recipient@example.com",
				subject: "sent by peer",
				text: "body",
			}),
		});
		expect(await res.text()).toBe("ok");

		// Instance A aggregates instance B's emails and filters to worker-b.
		const listFromA = await expectValidResponse(
			await instanceA.dispatchFetch(
				`${BASE_URL}/email/sending?worker=worker-b`
			),
			zEmailListSendingResponse,
			expect
		);
		expect(listFromA.result).toEqual([
			expect.objectContaining({ worker: "worker-b", subject: "sent by peer" }),
		]);

		// Selecting worker-a must not surface worker-b's sent email, even though
		// the two share an aggregated view.
		const listForWorkerA = await expectValidResponse(
			await instanceA.dispatchFetch(
				`${BASE_URL}/email/sending?worker=worker-a`
			),
			zEmailListSendingResponse,
			expect
		);
		expect(listForWorkerA.result).toEqual([]);
	});

	test("sending a test email to a peer worker delivers to that worker", async ({
		expect,
	}) => {
		// Instance A drives a test email at worker-a's email() handler, which
		// lives on instance A itself.
		const sendResponse = await instanceA.dispatchFetch(
			`${BASE_URL}/email/routing/send?worker=worker-a`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					from: "sender@example.com",
					to: ["recipient@example.com"],
					subject: "routed to peer",
					text: "body",
				}),
			}
		);
		await expectValidResponse(sendResponse, zEmailSendRoutingResponse, expect);

		// Instance B asks for worker-a's routing inbox; aggregation pulls it from
		// instance A.
		const listFromB = await expectValidResponse(
			await instanceB.dispatchFetch(
				`${BASE_URL}/email/routing?worker=worker-a`
			),
			zEmailListRoutingResponse,
			expect
		);
		expect(listFromB.result).toEqual([
			expect.objectContaining({
				worker: "worker-a",
				subject: "routed to peer",
			}),
		]);
	});

	// Regression: with no `?worker` filter, the unfiltered inbox lists every
	// instance's emails, so opening one must also work regardless of which
	// instance owns it. Previously the detail lookup only queried peers when a
	// worker was selected, so a peer-owned email 404'd in the unfiltered view.
	test("a peer worker's email opens in the unfiltered view", async ({
		expect,
	}) => {
		// worker-a receives a routing email on instance A.
		await expectValidResponse(
			await instanceA.dispatchFetch(
				`${BASE_URL}/email/routing/send?worker=worker-a`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						from: "sender@example.com",
						to: ["recipient@example.com"],
						subject: "unfiltered open",
						text: "body",
					}),
				}
			),
			zEmailSendRoutingResponse,
			expect
		);

		// From instance B, list the unfiltered inbox and find worker-a's email.
		const unfilteredList = await expectValidResponse(
			await instanceB.dispatchFetch(`${BASE_URL}/email/routing`),
			zEmailListRoutingResponse,
			expect
		);
		const peerEmail = unfilteredList.result?.find(
			(email) => email.subject === "unfiltered open"
		);
		expect(peerEmail).toBeDefined();
		const emailId = peerEmail?.messageId?.replace(/^<|>$/g, "");

		// Opening it from instance B (no worker filter) must resolve via the
		// broadcast peer lookup rather than 404.
		const detail = await expectValidResponse(
			await instanceB.dispatchFetch(`${BASE_URL}/email/routing/${emailId}`),
			zEmailGetRoutingResponse,
			expect
		);
		expect(detail.result).toEqual(
			expect.objectContaining({
				worker: "worker-a",
				subject: "unfiltered open",
			})
		);
	});
});

describe("Email API - store eviction", () => {
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

	// Mirrors MAX_STORED_EMAILS in src/workers/email/email-store.ts. The store
	// retains at most this many records per table and evicts oldest-first, so a
	// long dev session cannot grow the inbox without bound. Send a few more than
	// the cap and assert the window slides.
	const RETENTION_LIMIT = 200;

	test("caps the received list at the retention limit, evicting oldest first", async ({
		expect,
	}) => {
		const overflow = 5;
		const total = RETENTION_LIMIT + overflow;
		// A stable, ordered Message-ID per email so we can reason about which
		// records should survive eviction.
		const messageId = (index: number) =>
			`<evict-${index.toString().padStart(4, "0")}@example.com>`;

		for (let index = 0; index < total; index++) {
			const response = await mf.dispatchFetch(
				`${BASE_URL}/email/routing/send`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						from: "sender@example.com",
						to: ["recipient@example.com"],
						subject: `message ${index}`,
						text: "body",
						headers: { "message-id": messageId(index) },
					}),
				}
			);
			// Drain the body so MINIFLARE_ASSERT_BODIES_CONSUMED stays happy.
			await response.text();
		}

		const list = await expectValidResponse(
			await mf.dispatchFetch(`${BASE_URL}/email/routing`),
			zEmailListRoutingResponse,
			expect
		);

		// Exactly the cap is retained.
		expect(list.result).toHaveLength(RETENTION_LIMIT);

		const storedIds = new Set(list.result?.map((email) => email.messageId));
		// The oldest `overflow` records were evicted...
		for (let index = 0; index < overflow; index++) {
			expect(storedIds.has(messageId(index))).toBe(false);
		}
		// ...and the newest `RETENTION_LIMIT` remain, including the very last one
		// sent and the boundary survivor.
		expect(storedIds.has(messageId(total - 1))).toBe(true);
		expect(storedIds.has(messageId(overflow))).toBe(true);

		// The evicted records are gone from the detail endpoint too, not just the
		// list, so lookups don't resurrect them.
		const evictedDetail = await mf.dispatchFetch(
			`${BASE_URL}/email/routing/${messageIdToStorageId(messageId(0))}`
		);
		expect(evictedDetail.status).toBe(404);
		await evictedDetail.text();
	});
});
