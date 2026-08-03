import { getPublicUrl } from "miniflare:shared";
import { decodeWords } from "postal-mime";
import { z } from "zod";
import { CoreBindings, CorePaths } from "../../core";
import { MAX_LOCAL_EMAIL_BYTES } from "../../email/constants";
import {
	getHeader,
	messageIdToStorageId,
	synthesizeMessageId,
} from "../../email/message-id";
import { errorResponse, wrapResponse } from "../common";
import {
	zEmailHandlerEvent,
	zEmailHandlerForward,
	zEmailHandlerReply,
	zEmailRoutingDetail,
	zEmailRoutingItem,
	zEmailSendingDetail,
	zEmailSendingItem,
} from "../generated/zod.gen";
import type { EmailStoreService } from "../../email/storage";
import type { AppContext } from "../common";
import type { EmailSendRequest } from "../generated";

const EMAIL_ERROR_NOT_FOUND = 10601;
const EMAIL_ERROR_SEND_FAILED = 10602;
/** Occurs when the email store binding is missing (should not happen when the explorer is
 * enabled, since the store is registered alongside it). */
const EMAIL_ERROR_STORE_UNAVAILABLE = 10603;

const zEmailHandlerResult = z.object({
	outcome: z.enum(["ok", "exception"]),
	rejectReason: z.string().optional(),
	forwards: z.array(zEmailHandlerForward),
	replies: z.array(zEmailHandlerReply.extend({ raw: z.string() })),
	events: z.array(zEmailHandlerEvent),
});

function getEmailStore(c: AppContext): EmailStoreService | undefined {
	return c.env[CoreBindings.SERVICE_EMAIL_STORE];
}

function extractAddress(value: string): string {
	const match = value.match(/<([^>]+)>/);
	return (match ? match[1] : value).trim();
}

function hasUnsafeHeaderCharacters(value: string): boolean {
	return /[\u0000-\u001f\u007f]/u.test(value);
}

function isHeaderName(value: string): boolean {
	return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u.test(value);
}

function isMimeType(value: string): boolean {
	return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+\/[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u.test(
		value
	);
}

function isBase64(value: string): boolean {
	const normalized = value.replace(/\s/gu, "");
	if (
		normalized.length % 4 !== 0 ||
		!/^[A-Za-z0-9+/]*={0,2}$/u.test(normalized)
	) {
		return false;
	}
	try {
		atob(normalized);
		return true;
	} catch {
		return false;
	}
}

function validateEmailRequest(body: EmailSendRequest): string | undefined {
	const headerValues = [
		body.from,
		...body.to,
		...(body.cc ?? []),
		...(body.bcc ?? []),
		body.replyTo,
		body.subject,
	].filter((value): value is string => value !== undefined);
	if (headerValues.some(hasUnsafeHeaderCharacters)) {
		return "Email fields must not contain control characters.";
	}

	for (const [name, value] of Object.entries(body.headers ?? {})) {
		if (!isHeaderName(name) || hasUnsafeHeaderCharacters(value)) {
			return "Custom headers must use valid names and values.";
		}
	}

	for (const attachment of body.attachments ?? []) {
		if (
			hasUnsafeHeaderCharacters(attachment.filename) ||
			(attachment.contentId !== undefined &&
				hasUnsafeHeaderCharacters(attachment.contentId)) ||
			!isMimeType(attachment.type) ||
			!isBase64(attachment.content)
		) {
			return "Attachments must have valid filenames, MIME types, and base64 content.";
		}
	}

	return undefined;
}

function buildMimeMessage(body: EmailSendRequest, messageId: string): string {
	const headers: string[] = [`From: ${body.from}`, `To: ${body.to.join(", ")}`];
	if (body.cc?.length) {
		headers.push(`Cc: ${body.cc.join(", ")}`);
	}
	if (body.bcc?.length) {
		headers.push(`Bcc: ${body.bcc.join(", ")}`);
	}
	if (body.replyTo) {
		headers.push(`Reply-To: ${body.replyTo}`);
	}
	headers.push(`Subject: ${body.subject}`);
	headers.push(`Message-ID: ${messageId}`);
	headers.push(`Date: ${new Date().toUTCString()}`);
	headers.push("MIME-Version: 1.0");

	// Custom headers last so they can override defaults if intentionally set. A
	// caller-supplied Message-ID is skipped because it is already emitted above,
	// as `messageId`.
	for (const [key, value] of Object.entries(body.headers ?? {})) {
		if (key.toLowerCase() === "message-id") {
			continue;
		}
		headers.push(`${key}: ${value}`);
	}

	const text = body.text ?? "";
	const html = body.html;

	let contentHeaders: string[];
	let content: string;

	if (html && body.text) {
		const boundary = `----=_Part_${crypto.randomUUID()}`;
		contentHeaders = [
			`Content-Type: multipart/alternative; boundary="${boundary}"`,
		];
		content = [
			`--${boundary}`,
			"Content-Type: text/plain; charset=utf-8",
			"",
			text,
			`--${boundary}`,
			"Content-Type: text/html; charset=utf-8",
			"",
			html,
			`--${boundary}--`,
			"",
		].join("\r\n");
	} else if (html) {
		contentHeaders = ["Content-Type: text/html; charset=utf-8"];
		content = html;
	} else {
		contentHeaders = ["Content-Type: text/plain; charset=utf-8"];
		content = text;
	}

	const attachments = body.attachments ?? [];
	if (attachments.length === 0) {
		headers.push(...contentHeaders);
		return `${headers.join("\r\n")}\r\n\r\n${content}`;
	}

	const boundary = `----=_Mixed_${crypto.randomUUID()}`;
	headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

	const parts: string[] = [`--${boundary}`, ...contentHeaders, "", content];
	for (const attachment of attachments) {
		const filename = attachment.filename
			.replace(/[\r\n]/g, " ")
			.replace(/(["\\])/g, "\\$1");
		parts.push(
			`--${boundary}`,
			`Content-Type: ${attachment.type}; name="${filename}"`,
			`Content-Disposition: ${attachment.disposition ?? "attachment"}; filename="${filename}"`,
			"Content-Transfer-Encoding: base64",
			...(attachment.disposition === "inline" && attachment.contentId
				? [
						`Content-ID: ${attachment.contentId.startsWith("<") ? attachment.contentId : `<${attachment.contentId}>`}`,
					]
				: []),
			"",
			// RFC 2045 caps base64 body lines at 76 characters.
			attachment.content
				.replace(/\s/g, "")
				.replace(/(.{76})/g, "$1\r\n")
				.trimEnd()
		);
	}
	parts.push(`--${boundary}--`, "");

	return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
}

export async function listReceivedEmails(c: AppContext): Promise<Response> {
	const store = getEmailStore(c);
	if (!store) {
		return errorResponse(
			500,
			EMAIL_ERROR_STORE_UNAVAILABLE,
			"Email store is not available for this dev session."
		);
	}
	const emails = z.array(zEmailRoutingItem).parse(await store.listReceived());
	return c.json(wrapResponse(emails));
}

export async function getReceivedEmail(
	c: AppContext,
	emailId: string
): Promise<Response> {
	const store = getEmailStore(c);
	if (!store) {
		return errorResponse(
			500,
			EMAIL_ERROR_STORE_UNAVAILABLE,
			"Email store is not available for this dev session."
		);
	}
	const email = await store.findReceived(emailId);
	if (!email) {
		return errorResponse(
			404,
			EMAIL_ERROR_NOT_FOUND,
			`Email '${emailId}' not found.`
		);
	}
	// Decode MIME "encoded-word" headers (e.g. `=?utf-8?B?...?=`) in each reply's
	// display text so the explorer shows readable subjects. The lossless bytes
	// remain available through rawBase64.
	const decoded = {
		...email,
		replies: email.replies.map((reply) => ({
			...reply,
			raw: decodeWords(reply.raw),
		})),
	};
	return c.json(wrapResponse(zEmailRoutingDetail.parse(decoded)));
}

/**
 * Sends a test email to trigger the worker's email() handler.
 */
export async function sendTestEmail(
	c: AppContext,
	body: EmailSendRequest
): Promise<Response> {
	const invalidRequest = validateEmailRequest(body);
	if (invalidRequest !== undefined) {
		return errorResponse(400, 10000, invalidRequest);
	}
	const from = extractAddress(body.from);
	const to = extractAddress(body.to[0] ?? "");

	if (!to) {
		return errorResponse(400, 10000, "At least one recipient is required.");
	}

	// Derive the Message-ID exactly as the `send_email` binding does, so a
	// received and a sent email agree on it. Honour one the caller set
	// explicitly, since the send dialog allows custom headers.
	const messageId =
		getHeader(body.headers, "Message-ID") ?? synthesizeMessageId(from);
	// TODO(miniflare v5): switch on-disk file naming to a mimetext-style id
	// to unify the file name with the Message-ID seen in local explorer.
	const id = messageIdToStorageId(messageId);
	const mime = buildMimeMessage(body, messageId);
	if (new TextEncoder().encode(mime).byteLength > MAX_LOCAL_EMAIL_BYTES) {
		return errorResponse(
			400,
			EMAIL_ERROR_SEND_FAILED,
			"Email message exceeds the 1 MiB local development limit."
		);
	}

	const entryUrl = await getPublicUrl(c.env.MINIFLARE_LOOPBACK);
	const deliverUrl = new URL(CorePaths.EMAIL, entryUrl);
	deliverUrl.searchParams.set("from", from);
	deliverUrl.searchParams.set("to", to);
	deliverUrl.searchParams.set("id", id);
	// Request the JSON result so we can surface the handler outcome (including a
	// `setReject()` reason) instead of just a text status.
	deliverUrl.searchParams.set("format", "json");
	const response = await fetch(deliverUrl, { method: "POST", body: mime });

	// A 4xx means the message itself was invalid (bad envelope, unparseable, or
	// too large) and never reached the handler — that's a send failure. Anything
	// else (including a handler that rejected or threw) counts as delivered.
	if (response.status >= 400 && response.status < 500) {
		const message = await response.text();
		return errorResponse(
			400,
			EMAIL_ERROR_SEND_FAILED,
			message || "Failed to deliver test email."
		);
	}

	const result = zEmailHandlerResult.parse(await response.json());
	return c.json(
		wrapResponse({
			messageId,
			outcome: result.outcome,
			...(result.rejectReason !== undefined
				? { rejectReason: result.rejectReason }
				: {}),
		})
	);
}

export async function listSentEmails(c: AppContext): Promise<Response> {
	const store = getEmailStore(c);
	if (!store) {
		return errorResponse(
			500,
			EMAIL_ERROR_STORE_UNAVAILABLE,
			"Email store is not available for this dev session."
		);
	}
	const emails = z.array(zEmailSendingItem).parse(await store.listSent());
	return c.json(wrapResponse(emails));
}

export async function getSentEmail(
	c: AppContext,
	emailId: string
): Promise<Response> {
	const store = getEmailStore(c);
	if (!store) {
		return errorResponse(
			500,
			EMAIL_ERROR_STORE_UNAVAILABLE,
			"Email store is not available for this dev session."
		);
	}
	const email = await store.findSent(emailId);
	if (!email) {
		return errorResponse(
			404,
			EMAIL_ERROR_NOT_FOUND,
			`Email '${emailId}' not found.`
		);
	}
	return c.json(wrapResponse(zEmailSendingDetail.parse(email)));
}
