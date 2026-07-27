import { readFile } from "node:fs/promises";
import path from "node:path";
import { Miniflare } from "miniflare";
import dedent from "ts-dedent";
import { afterAll, beforeAll, describe, test } from "vitest";
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
// "forward@" recipient so we can exercise the handling-path capture.
const EMAIL_HANDLER_WORKER = dedent /* javascript */ `
	export default {
		fetch() {
			return new Response("user worker");
		},
		async email(message) {
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

	test("delivers a test email and captures it", async ({ expect }) => {
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
		const sentId = sendData.result?.id;
		expect(sentId).toBeDefined();

		const listResponse = await mf.dispatchFetch(`${BASE_URL}/email/routing`);
		const data = await expectValidResponse(
			listResponse,
			zEmailListRoutingResponse,
			expect
		);
		// The id returned by the send must be the id the email is stored under, so
		// the caller can reference the delivered message directly.
		const stored = data.result?.find((e) => e.id === sentId);
		expect(stored).toEqual(
			expect.objectContaining({
				from: "sender@example.com",
				to: "recipient@example.com",
				subject: "Hello from the explorer",
			})
		);

		// And the detail endpoint must resolve that same id.
		const detailResponse = await mf.dispatchFetch(
			`${BASE_URL}/email/routing/${sentId}`
		);
		const detail = await expectValidResponse(
			detailResponse,
			zEmailGetRoutingResponse,
			expect
		);
		expect(detail.result?.id).toBe(sentId);
	});

	test("returns details for a received email", async ({ expect }) => {
		const listResponse = await mf.dispatchFetch(`${BASE_URL}/email/routing`);
		const list = await expectValidResponse(
			listResponse,
			zEmailListRoutingResponse,
			expect
		);
		const id = list.result?.[0]?.id;
		expect(id).toBeDefined();

		const detailResponse = await mf.dispatchFetch(
			`${BASE_URL}/email/routing/${id}`
		);
		const detail = await expectValidResponse(
			detailResponse,
			zEmailGetRoutingResponse,
			expect
		);
		expect(detail.result?.raw).toContain("Subject: Hello from the explorer");
		expect(detail.result?.handlingPath[0]?.action).toBe("received");
	});

	test("records a forwarded handling path", async ({ expect }) => {
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
		expect(forwarded?.handlingPath.map((action) => action.action)).toContain(
			"forwarded"
		);
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

	test("succeeds when the worker has no email() handler", async ({
		expect,
	}) => {
		const response = await mf.dispatchFetch(`${BASE_URL}/email/routing/send`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				from: "sender@example.com",
				to: ["recipient@example.com"],
				subject: "Undeliverable",
				text: "body",
			}),
		});
		await expectValidResponse(response, zEmailSendRoutingResponse, expect);
	});

	test("records the message in the inbox marked as unhandled", async ({
		expect,
	}) => {
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
			`${BASE_URL}/email/routing/${email?.id}`
		);
		const detailData = await expectValidResponse(
			detail,
			zEmailGetRoutingResponse,
			expect
		);
		expect(detailData.result?.handlingPath.map((a) => a.action)).toEqual([
			"unhandled",
		]);
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

	test("reply is saved to disk under the routing id logged in the explorer", async ({
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

		// The same message must be logged in the explorer's routing inbox, and its
		// id must match the id the reply file was saved under.
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
		expect(routed?.id).toBe(fileId);

		// The inbox list omits the (potentially large) reply raw...
		const listedReply = routed?.handlingPath.find(
			(a) => a.action === "replied"
		);
		expect(listedReply).toBeDefined();
		expect(listedReply?.details?.raw).toBeUndefined();

		// ...but the detail view exposes it, so the reply can be shown when the
		// "Replied" handling-path step is clicked/expanded in the explorer.
		const detailResponse = await mf.dispatchFetch(
			`${BASE_URL}/email/routing/${routed?.id}`
		);
		const detail = await expectValidResponse(
			detailResponse,
			zEmailGetRoutingResponse,
			expect
		);
		const detailReply = detail.result?.handlingPath.find(
			(a) => a.action === "replied"
		);
		expect(detailReply?.details?.raw).toContain("This is a reply.");
		// The reply's MIME encoded-word subject must be surfaced decoded, not raw.
		expect(detailReply?.details?.raw).toContain(
			"Subject: An email generated in a Worker"
		);
		expect(detailReply?.details?.raw).not.toContain("=?utf-8?B?");
		// The reply's Message-ID is preserved from the worker's raw email.
		expect(detailReply?.details?.raw).toContain(
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

	test("captures an email sent through a send_email binding", async ({
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
		expect(data.result?.[0]?.to).toContain("recipient@example.com");
	});

	test("returns details for a sent email", async ({ expect }) => {
		const listResponse = await mf.dispatchFetch(`${BASE_URL}/email/sending`);
		const list = await expectValidResponse(
			listResponse,
			zEmailListSendingResponse,
			expect
		);
		const id = list.result?.[0]?.id;
		expect(id).toBeDefined();

		const detailResponse = await mf.dispatchFetch(
			`${BASE_URL}/email/sending/${id}`
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
});
