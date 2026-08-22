import { extractEmailAddress, formatEmailAddress } from "./address";
import { bytesToBase64 } from "./capture";
import {
	hasControlCharacters,
	isMimeType,
	normalizeBase64,
} from "./input-validation";
import { synthesizeMessageId } from "./message-id";
import type { EmailReplyMessageBuilder } from "./types";
import type { Email } from "postal-mime";

export interface MimeAttachment {
	disposition?: "inline" | "attachment";
	contentId?: string;
	filename: string;
	type: string;
	content: string;
}

export interface MimeMessage {
	from: string;
	to: string[];
	cc?: string[];
	replyTo?: string;
	subject: string;
	headers?: Record<string, string>;
	text?: string;
	html?: string;
	attachments?: MimeAttachment[];
}

export function buildMimeMessage(
	message: MimeMessage,
	messageId: string,
	generatedHeaders: Record<string, string> = {}
): string {
	const headers: string[] = [
		`From: ${message.from}`,
		`To: ${message.to.join(", ")}`,
	];
	if (message.cc?.length) {
		headers.push(`Cc: ${message.cc.join(", ")}`);
	}
	if (message.replyTo) {
		headers.push(`Reply-To: ${message.replyTo}`);
	}
	headers.push(`Subject: ${message.subject}`);
	headers.push(`Message-ID: ${messageId}`);
	headers.push(`Date: ${new Date().toUTCString()}`);
	headers.push("MIME-Version: 1.0");
	for (const [key, value] of Object.entries(generatedHeaders)) {
		headers.push(`${key}: ${value}`);
	}

	const managedHeaders = new Set([
		"bcc",
		"message-id",
		"content-type",
		"content-transfer-encoding",
		...Object.keys(generatedHeaders).map((name) => name.toLowerCase()),
	]);
	for (const [key, value] of Object.entries(message.headers ?? {})) {
		if (managedHeaders.has(key.toLowerCase())) {
			continue;
		}
		headers.push(`${key}: ${value}`);
	}

	const text = message.text ?? "";
	const html = message.html;

	let contentHeaders: string[];
	let content: string;

	if (html && message.text) {
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

	const attachments = message.attachments ?? [];
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
			attachment.content
				.replace(/\s/g, "")
				.replace(/(.{76})/g, "$1\r\n")
				.trimEnd()
		);
	}
	parts.push(`--${boundary}--`, "");

	return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
}

function attachmentContentToBase64(
	content: string | ArrayBuffer | ArrayBufferView
): string {
	if (typeof content === "string") {
		const normalized = normalizeBase64(content);
		if (normalized === undefined) {
			throw new Error("invalid attachment content");
		}
		return normalized;
	}
	const bytes =
		content instanceof ArrayBuffer
			? new Uint8Array(content)
			: new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
	return bytesToBase64(bytes);
}

export function buildReplyFromMessageBuilder(
	builder: EmailReplyMessageBuilder,
	incomingMessage: Email,
	recipient: string
): { raw: Uint8Array; messageId: string; sender: string } {
	const sender = formatEmailAddress(builder.from);
	const replyTo =
		builder.replyTo === undefined
			? undefined
			: formatEmailAddress(builder.replyTo);
	const headerValues = [
		sender,
		recipient,
		replyTo,
		builder.subject,
		...(builder.attachments ?? []).flatMap((attachment) => [
			attachment.filename,
			attachment.contentId,
		]),
	].filter((value): value is string => value !== undefined);
	if (headerValues.some(hasControlCharacters)) {
		throw new Error("invalid headers set");
	}
	for (const attachment of builder.attachments ?? []) {
		if (
			!isMimeType(attachment.type) ||
			(attachment.disposition !== undefined &&
				attachment.disposition !== "inline" &&
				attachment.disposition !== "attachment") ||
			(attachment.disposition === "inline" && !attachment.contentId)
		) {
			throw new Error("invalid attachment");
		}
	}

	if (Object.values(builder.headers ?? {}).some(hasControlCharacters)) {
		throw new Error("invalid headers set");
	}
	let customHeaders: Headers;
	try {
		customHeaders = new Headers(builder.headers);
	} catch {
		throw new Error("invalid headers set");
	}
	if (customHeaders.has("received")) {
		throw new Error("invalid headers set");
	}
	for (const name of [
		"from",
		"to",
		"cc",
		"bcc",
		"reply-to",
		"subject",
		"message-id",
		"in-reply-to",
		"references",
		"date",
		"mime-version",
		"content-type",
		"content-transfer-encoding",
	]) {
		customHeaders.delete(name);
	}

	const incomingMessageId = incomingMessage.messageId;
	if (incomingMessageId === undefined) {
		throw new Error("Original email has no Message-ID");
	}
	const messageId = synthesizeMessageId(extractEmailAddress(builder.from));
	const references =
		incomingMessage.references === undefined
			? incomingMessageId
			: `${incomingMessage.references} ${incomingMessageId}`;
	const raw = buildMimeMessage(
		{
			from: sender,
			to: [recipient],
			replyTo,
			subject: builder.subject,
			headers: Object.fromEntries(customHeaders),
			text: builder.text,
			html: builder.html,
			attachments: builder.attachments?.map((attachment) => ({
				disposition: attachment.disposition,
				contentId: attachment.contentId,
				filename: attachment.filename,
				type: attachment.type,
				content: attachmentContentToBase64(attachment.content),
			})),
		},
		messageId,
		{
			"In-Reply-To": incomingMessageId,
			References: references,
		}
	);
	return {
		raw: new TextEncoder().encode(raw),
		messageId,
		sender,
	};
}
