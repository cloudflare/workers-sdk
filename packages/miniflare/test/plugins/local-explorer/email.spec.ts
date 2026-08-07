import { Buffer } from "node:buffer";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { Miniflare } from "miniflare";
import dedent from "ts-dedent";
import { afterAll, beforeAll, describe, test } from "vitest";
import { CorePaths } from "../../../src/workers/core/constants";
import { MAX_LOCAL_EMAIL_BYTES } from "../../../src/workers/email/capture";
import {
	zEmailGetRoutingResponse,
	zEmailGetSendingResponse,
	zEmailListRoutingResponse,
	zEmailListSendingResponse,
	zWorkersApiResponseCommonFailure,
} from "../../../src/workers/local-explorer/generated/zod.gen";
import { disposeWithRetry, waitForWorkersInRegistry } from "../../test-shared";
import { expectValidResponse } from "./helpers";

const BASE_URL = `http://localhost${CorePaths.EXPLORER}/api`;
const WORKER_NAME = "email-worker";

const EMAIL_WORKER = dedent /* javascript */ `
	import { EmailMessage } from "cloudflare:email";

	export default {
		async fetch(request, env) {
			const url = new URL(request.url);
			if (url.pathname === "/send-raw") {
				const message = await env.SEND_EMAIL.send(new EmailMessage(
					url.searchParams.get("from"),
					url.searchParams.get("to"),
					request.body
				));
				return Response.json(message);
			}

			if (url.pathname === "/send-builder") {
				return Response.json(await env.SEND_EMAIL.send(await request.json()));
			}

			return new Response("ok");
		},

		async email(message) {
			const mode = message.headers.get("x-test-mode");
			if (mode === "forward") {
				await message.forward("forwarded@example.com");
			} else if (mode === "reply") {
				await message.reply(
					new EmailMessage(
						"reply@example.com",
						message.from,
						"From: reply@example.com\\n" +
							"To: sender@example.com\\n" +
							"Subject: =?UTF-8?B?UmVwbHkgc3ViamVjdA==?=\\n" +
							"In-Reply-To: <received-reply@example.com>\\n" +
							"Message-ID: <reply@example.com>\\n" +
							"MIME-Version: 1.0\\n" +
							"Content-Type: text/plain\\n\\n" +
							"Body literal =?UTF-8?B?U2hvdWxkIHN0YXkgcmF3?="
					)
				);
			} else if (mode === "reply-large") {
				const filler = "z".repeat(2 * 1024 * 1024);
				await message.reply(
					new EmailMessage(
						"reply@example.com",
						message.from,
						"From: reply@example.com\\n" +
							"To: sender@example.com\\n" +
							"Subject: Large reply\\n" +
							"In-Reply-To: <received-large-reply@example.com>\\n" +
							"Message-ID: <large-reply@example.com>\\n" +
							"MIME-Version: 1.0\\n" +
							"Content-Type: text/plain\\n\\n" +
							filler
					)
				);
			} else if (mode === "reject") {
				message.setReject("Rejected by test worker");
			}
		},
	};
`;

describe("Local Explorer email API", () => {
	let mf: Miniflare;

	beforeAll(async () => {
		mf = new Miniflare({
			compatibilityDate: "2025-03-17",
			inspectorPort: 0,
			unsafeLocalExplorer: true,
			unsafeTriggerHandlers: true,
			workers: [
				{
					name: WORKER_NAME,
					compatibilityDate: "2025-03-17",
					modules: true,
					script: EMAIL_WORKER,
					email: {
						send_email: [{ name: "SEND_EMAIL" }],
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
			messageId: expect.stringMatching(/^<[A-Za-z0-9]+@example\.com>$/),
		});
		const sentMessageId = sentResult.messageId;

		const listResponse = await mf.dispatchFetch(`${BASE_URL}/email/sending`);
		const list = await expectValidResponse(
			listResponse,
			zEmailListSendingResponse,
			expect
		);
		const item = list.result?.find(
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
			`${BASE_URL}/email/sending/${encodeURIComponent(sentMessageId)}`
		);
		const detail = await expectValidResponse(
			detailResponse,
			zEmailGetSendingResponse,
			expect
		);
		expect(detail.result).toMatchObject({
			worker: WORKER_NAME,
			messageId: sentMessageId,
			raw,
			rawBase64: Buffer.from(raw).toString("base64"),
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
			messageId: expect.stringMatching(/^<[A-Za-z0-9]+@example\.com>$/),
		});
		const sentMessageId = sentResult.messageId;

		const list = await expectValidResponse(
			await mf.dispatchFetch(`${BASE_URL}/email/sending`),
			zEmailListSendingResponse,
			expect
		);
		const item = list.result?.find(
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
				`${BASE_URL}/email/sending/${encodeURIComponent(sentMessageId)}`
			),
			zEmailGetSendingResponse,
			expect
		);
		expect(detail.result).toMatchObject({
			text: "Plain text",
			html: "<p>HTML</p>",
		});
	});

	test("sends a >1 MiB EmailMessage and captures a truncated copy", async ({
		expect,
	}) => {
		const filler = "x".repeat(2 * 1024 * 1024);
		const raw =
			[
				"From: sender@example.com",
				"To: recipient@example.com",
				"Message-ID: <sent-large-raw@example.com>",
				"Subject: Large raw message",
				"MIME-Version: 1.0",
				"Content-Type: text/plain",
				"",
				filler,
			].join("\r\n") + "\r\n";
		expect(new TextEncoder().encode(raw).byteLength).toBeGreaterThan(
			MAX_LOCAL_EMAIL_BYTES
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
		expect(sentResult.messageId).toMatch(/^<[A-Za-z0-9]+@example\.com>$/);

		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/email/sending/${encodeURIComponent(sentResult.messageId)}`
			),
			zEmailGetSendingResponse,
			expect
		);
		// Delivery used the full body, but the captured copy is truncated to the
		// local limit.
		expect(detail.result?.subject).toBe("Large raw message");
		const capturedBytes = Buffer.from(
			String(detail.result?.rawBase64),
			"base64"
		).byteLength;
		expect(capturedBytes).toBe(MAX_LOCAL_EMAIL_BYTES);
	});

	test("sends a >1 MiB MessageBuilder and captures a truncated copy", async ({
		expect,
	}) => {
		const text = "y".repeat(2 * 1024 * 1024);
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
		expect(sentResult.messageId).toMatch(/^<[A-Za-z0-9]+@example\.com>$/);

		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/email/sending/${encodeURIComponent(sentResult.messageId)}`
			),
			zEmailGetSendingResponse,
			expect
		);
		expect(detail.result?.subject).toBe("Large builder message");
		expect(new TextEncoder().encode(detail.result?.text ?? "").byteLength).toBe(
			MAX_LOCAL_EMAIL_BYTES
		);
	});

	test("captures a >1 MiB reply as a truncated copy", async ({ expect }) => {
		// The incoming email stays small; the worker self-generates a >1 MiB
		// reply body so we exercise reply capture without tripping the
		// test-send guard on the incoming message.
		const response = await mf.dispatchFetch(
			`${BASE_URL}/email/routing/send?worker=${WORKER_NAME}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					from: "sender@example.com",
					to: ["recipient@example.com"],
					subject: "Large reply target",
					text: "Large reply target",
					headers: {
						"Message-ID": "<received-large-reply@example.com>",
						"X-Test-Mode": "reply-large",
					},
				}),
			}
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			result: {
				messageId: "<received-large-reply@example.com>",
				outcome: "ok",
			},
		});

		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/email/routing/${encodeURIComponent("<received-large-reply@example.com>")}`
			),
			zEmailGetRoutingResponse,
			expect
		);
		expect(detail.result?.events.map(({ type }) => type)).toEqual([
			"received",
			"reply",
		]);
		const reply = detail.result?.replies[0];
		expect(reply?.messageId).toBe("<large-reply@example.com>");
		// The reply was delivered and captured, trimmed to the local limit.
		expect(new TextEncoder().encode(reply?.raw ?? "").byteLength).toBe(
			MAX_LOCAL_EMAIL_BYTES
		);
	});

	test("delivers and captures a truncated copy of a >1 MiB received email", async ({
		expect,
	}) => {
		const headers = dedent`
			From: sender@example.com
			To: recipient@example.com
			Message-ID: <received-large@example.com>
			MIME-Version: 1.0
			Content-Type: text/plain

		`;
		const headerBytes = new TextEncoder().encode(headers).byteLength;
		const raw = headers + "x".repeat(2 * 1024 * 1024 - headerBytes);

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
				`${BASE_URL}/email/routing/${encodeURIComponent("<received-large@example.com>")}`
			),
			zEmailGetRoutingResponse,
			expect
		);
		// Full original size is recorded, but the captured raw is truncated.
		expect(detail.result?.rawSize).toBe(2 * 1024 * 1024);
		expect(
			Buffer.from(String(detail.result?.rawBase64), "base64").byteLength
		).toBe(MAX_LOCAL_EMAIL_BYTES);
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
			await mf.dispatchFetch(`${BASE_URL}/email/routing?worker=${WORKER_NAME}`),
			zEmailListRoutingResponse,
			expect
		);
		const item = list.result?.find(
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
				`${BASE_URL}/email/routing/${encodeURIComponent("<received-forward@example.com>")}`
			),
			zEmailGetRoutingResponse,
			expect
		);
		expect(detail.result).toMatchObject({
			raw,
			rawBase64: Buffer.from(raw).toString("base64"),
		});
	});

	test("captures a received email at the local size limit", async ({
		expect,
	}) => {
		const headers = dedent`
			From: sender@example.com
			To: recipient@example.com
			Message-ID: <near-limit@example.com>
			MIME-Version: 1.0
			Content-Type: text/plain

		`;
		const headerBytes = new TextEncoder().encode(headers).byteLength;
		const raw = headers + "x".repeat(MAX_LOCAL_EMAIL_BYTES - headerBytes);

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
		expect(await response.json()).toMatchObject({ outcome: "ok" });

		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/email/routing/${encodeURIComponent("<near-limit@example.com>")}`
			),
			zEmailGetRoutingResponse,
			expect
		);
		expect(detail.result).toMatchObject({
			messageId: "<near-limit@example.com>",
			rawSize: MAX_LOCAL_EMAIL_BYTES,
			raw,
			rawBase64: Buffer.from(raw).toString("base64"),
		});
	});

	test("filters received emails by worker and records rejection", async ({
		expect,
	}) => {
		const response = await mf.dispatchFetch(
			`${BASE_URL}/email/routing/send?worker=${WORKER_NAME}`,
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
		expect(await response.json()).toMatchObject({
			result: {
				messageId: "<received-reject@example.com>",
				outcome: "ok",
				rejectReason: "Rejected by test worker",
			},
		});

		const filtered = await expectValidResponse(
			await mf.dispatchFetch(`${BASE_URL}/email/routing?worker=other-worker`),
			zEmailListRoutingResponse,
			expect
		);
		expect(filtered.result).toEqual([]);

		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/email/routing/${encodeURIComponent("<received-reject@example.com>")}?worker=other-worker`
			),
			zWorkersApiResponseCommonFailure,
			expect,
			404
		);
		expect(detail.result).toBeNull();
	});

	test("stores reply events and reply content", async ({ expect }) => {
		const response = await mf.dispatchFetch(
			`${BASE_URL}/email/routing/send?worker=${WORKER_NAME}`,
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
		expect(await response.json()).toMatchObject({
			result: {
				messageId: "<received-reply@example.com>",
				outcome: "ok",
			},
		});

		const detail = await expectValidResponse(
			await mf.dispatchFetch(
				`${BASE_URL}/email/routing/${encodeURIComponent("<received-reply@example.com>")}`
			),
			zEmailGetRoutingResponse,
			expect
		);
		expect(detail.result?.events.map(({ type }) => type)).toEqual([
			"received",
			"reply",
		]);
		const reply = detail.result?.replies[0];
		expect(reply).toMatchObject({
			messageId: "<reply@example.com>",
			sender: "reply@example.com",
			raw: expect.stringContaining("References: <received-reply@example.com>"),
			rawBase64: expect.any(String),
		});
		expect(reply?.raw).toContain("Subject: Reply subject");
		expect(reply?.raw).toContain(
			"Body literal =?UTF-8?B?U2hvdWxkIHN0YXkgcmF3?="
		);
		expect(
			Buffer.from(String(reply?.rawBase64), "base64").toString()
		).toContain("Subject: =?UTF-8?B?UmVwbHkgc3ViamVjdA==?=");
	});

	test("retains only the newest 200 received emails", async ({ expect }) => {
		for (let index = 0; index <= 200; index++) {
			const messageId = `<retention-${index}@example.com>`;
			const response = await mf.dispatchFetch(
				`${BASE_URL}/email/routing/send?worker=${WORKER_NAME}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						from: "sender@example.com",
						to: ["recipient@example.com"],
						subject: "Retention test",
						text: `Message ${index}`,
						headers: { "Message-ID": messageId },
					}),
				}
			);
			expect(response.status).toBe(200);
			await response.json();
		}

		const list = await expectValidResponse(
			await mf.dispatchFetch(`${BASE_URL}/email/routing`),
			zEmailListRoutingResponse,
			expect
		);
		const retained = list.result?.filter((email) =>
			email.messageId.startsWith("<retention-")
		);
		expect(retained).toHaveLength(200);
		expect(retained?.[0]?.messageId).toBe("<retention-200@example.com>");
		expect(
			retained?.some((email) => email.messageId === "<retention-0@example.com>")
		).toBe(false);
	});
});

describe("Local Explorer email aggregation", () => {
	let registryPath: string;
	let instanceA: Miniflare;
	let instanceB: Miniflare;

	beforeAll(async () => {
		registryPath = mkdtempSync(path.join(tmpdir(), "mf-email-registry-"));
		instanceA = new Miniflare({
			name: "email-a",
			unsafeRegisterWorker: true,
			inspectorPort: 0,
			compatibilityDate: "2025-03-17",
			modules: true,
			script: EMAIL_WORKER,
			unsafeLocalExplorer: true,
			unsafeTriggerHandlers: true,
			unsafeDevRegistryPath: registryPath,
		});
		instanceB = new Miniflare({
			name: "email-b",
			unsafeRegisterWorker: true,
			inspectorPort: 0,
			compatibilityDate: "2025-03-17",
			modules: true,
			script: EMAIL_WORKER,
			unsafeLocalExplorer: true,
			unsafeTriggerHandlers: true,
			unsafeDevRegistryPath: registryPath,
		});
		await Promise.all([instanceA.ready, instanceB.ready]);
		await waitForWorkersInRegistry(registryPath, ["email-a", "email-b"]);
	});

	afterAll(async () => {
		await Promise.all([
			disposeWithRetry(instanceA),
			disposeWithRetry(instanceB),
		]);
		removeDirSync(registryPath);
	});

	test("aggregates peer records and proxies peer details", async ({
		expect,
	}) => {
		const messageId = "<peer-received@example.com>";
		const response = await instanceA.dispatchFetch(
			`${BASE_URL}/email/routing/send?worker=email-b`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					from: "sender@example.com",
					to: ["recipient@example.com"],
					subject: "Peer email",
					text: "Stored by the peer instance",
					headers: { "Message-ID": messageId },
				}),
			}
		);
		expect(response.status).toBe(200);
		await response.json();

		const list = await expectValidResponse(
			await instanceA.dispatchFetch(`${BASE_URL}/email/routing`),
			zEmailListRoutingResponse,
			expect
		);
		expect(list.result).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ worker: "email-b", messageId }),
			])
		);

		const detail = await expectValidResponse(
			await instanceA.dispatchFetch(
				`${BASE_URL}/email/routing/${encodeURIComponent(messageId)}`
			),
			zEmailGetRoutingResponse,
			expect
		);
		expect(detail.result).toMatchObject({
			worker: "email-b",
			messageId,
		});

		const wrongWorker = await expectValidResponse(
			await instanceA.dispatchFetch(
				`${BASE_URL}/email/routing/${encodeURIComponent(messageId)}?worker=email-a`
			),
			zWorkersApiResponseCommonFailure,
			expect,
			404
		);
		expect(wrongWorker.result).toBeNull();
	});
});
