import PostalMime from "postal-mime";
import { extractEmailAddress, formatEmailAddress } from "./address";
import { bytesToBase64 } from "./capture";
import {
	foldHeaderValue,
	hasControlCharacters,
	isManagedEmailHeaderName,
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

interface ParsedMimeHeaders {
	entries: Array<[string, string]>;
	byName: Map<string, string[]>;
}

interface ParsedMimePart {
	headers: ParsedMimeHeaders;
	body: string;
}

/**
 * Projects MIME emitted by {@link buildMimeMessage} back into composer fields.
 * Arbitrary MIME is intentionally rejected: provenance authorises projection,
 * while this structural check prevents malformed captures becoming partial
 * drafts.
 */
export async function projectComposerMime(
	raw: Uint8Array
): Promise<MimeMessage> {
	const source = new TextDecoder("utf-8", {
		fatal: true,
		ignoreBOM: false,
	}).decode(raw);
	const top = parseMimePart(source);
	const parsed = await PostalMime.parse(raw);
	const from = requireSingleHeader(top.headers, "from");
	const to = requireSingleHeader(top.headers, "to");
	const cc = getOptionalSingleHeader(top.headers, "cc");
	const replyTo = getOptionalSingleHeader(top.headers, "reply-to");
	const subject = requireSingleHeader(top.headers, "subject");
	requireSingleHeader(top.headers, "message-id");
	requireSingleHeader(top.headers, "date");
	requireSingleHeader(top.headers, "mime-version");
	const contentType = requireSingleHeader(top.headers, "content-type");
	if (parsed.from.address === undefined || parsed.to === undefined) {
		throw new Error("composer MIME is missing required addresses");
	}
	if (from === "" || to === "" || subject !== (parsed.subject ?? "")) {
		throw new Error("composer MIME headers could not be projected");
	}

	// The composer writes validated address strings directly into these headers.
	// Keep that text authoritative because parser normalization can alter quoted
	// local parts; original To/Cc array boundaries are not retained in MIME.
	const projected: MimeMessage = {
		from,
		to: [to],
		subject: parsed.subject ?? "",
	};
	if (cc !== undefined) {
		projected.cc = [cc];
	}
	if (replyTo !== undefined) {
		projected.replyTo = replyTo;
	}

	const customHeaders = Object.fromEntries(
		top.headers.entries.filter(
			([name]) => !isManagedEmailHeaderName(name.toLowerCase())
		)
	);
	if (Object.keys(customHeaders).length > 0) {
		projected.headers = customHeaders;
	}

	const topType = parseParameterizedHeader(contentType);
	let attachmentParts: ParsedMimePart[] = [];
	if (topType.value === "multipart/mixed") {
		const boundary = requireParameter(topType, "boundary");
		const parts = parseMultipart(top.body, boundary);
		if (parts.length < 2) {
			throw new Error("composer multipart/mixed structure is invalid");
		}
		projectBodyPart(parts[0], projected);
		attachmentParts = parts.slice(1);
	} else {
		projectBodyPart(top, projected);
	}

	const parsedAttachments = parsed.attachments ?? [];
	if (attachmentParts.length !== parsedAttachments.length) {
		throw new Error("composer attachment count does not match parsed MIME");
	}
	if (attachmentParts.length > 0) {
		projected.attachments = attachmentParts.map((part, index) => {
			const parserAttachment = parsedAttachments[index];
			if (parserAttachment === undefined) {
				throw new Error("composer attachment order is invalid");
			}
			return projectAttachment(part, parserAttachment);
		});
	}
	return projected;
}

function parseMimePart(source: string): ParsedMimePart {
	const separator = source.indexOf("\r\n\r\n");
	if (separator === -1) {
		throw new Error("composer MIME has no header/body separator");
	}
	return {
		headers: parseMimeHeaders(source.slice(0, separator)),
		body: source.slice(separator + 4),
	};
}

function parseMimeHeaders(source: string): ParsedMimeHeaders {
	const entries: Array<[string, string]> = [];
	for (const line of source.split("\r\n")) {
		if (/^[ \t]/u.test(line)) {
			const previous = entries.at(-1);
			if (previous === undefined) {
				throw new Error("composer MIME has an invalid folded header");
			}
			previous[1] += ` ${line.trimStart()}`;
			continue;
		}
		const separator = line.indexOf(":");
		if (separator <= 0) {
			throw new Error("composer MIME has an invalid header");
		}
		entries.push([line.slice(0, separator), line.slice(separator + 1).trim()]);
	}
	const byName = new Map<string, string[]>();
	for (const [name, value] of entries) {
		const normalized = name.toLowerCase();
		byName.set(normalized, [...(byName.get(normalized) ?? []), value]);
	}
	return { entries, byName };
}

function requireSingleHeader(headers: ParsedMimeHeaders, name: string): string {
	const values = headers.byName.get(name);
	if (values?.length !== 1) {
		throw new Error(`composer MIME requires one ${name} header`);
	}
	return values[0] ?? "";
}

function getOptionalSingleHeader(
	headers: ParsedMimeHeaders,
	name: string
): string | undefined {
	const values = headers.byName.get(name);
	if (values === undefined) {
		return undefined;
	}
	if (values.length !== 1) {
		throw new Error(`composer MIME allows at most one ${name} header`);
	}
	return values[0] ?? "";
}

function projectBodyPart(part: ParsedMimePart, projected: MimeMessage): void {
	const contentType = parseParameterizedHeader(
		requireSingleHeader(part.headers, "content-type")
	);
	if (contentType.value === "text/plain") {
		projected.text = part.body;
		return;
	}
	if (contentType.value === "text/html") {
		projected.html = part.body;
		return;
	}
	if (contentType.value !== "multipart/alternative") {
		throw new Error("composer MIME has an unsupported body structure");
	}
	const parts = parseMultipart(
		part.body,
		requireParameter(contentType, "boundary")
	);
	if (parts.length !== 2) {
		throw new Error("composer multipart/alternative structure is invalid");
	}
	const plainType = parseParameterizedHeader(
		requireSingleHeader(parts[0]?.headers ?? part.headers, "content-type")
	).value;
	const htmlType = parseParameterizedHeader(
		requireSingleHeader(parts[1]?.headers ?? part.headers, "content-type")
	).value;
	if (plainType !== "text/plain" || htmlType !== "text/html") {
		throw new Error("composer multipart/alternative order is invalid");
	}
	projected.text = parts[0]?.body;
	projected.html = parts[1]?.body;
}

function parseMultipart(source: string, boundary: string): ParsedMimePart[] {
	const marker = `--${boundary}`;
	if (!source.startsWith(`${marker}\r\n`)) {
		throw new Error("composer MIME multipart preamble is invalid");
	}
	const parts: ParsedMimePart[] = [];
	let offset = marker.length + 2;
	for (;;) {
		const next = source.indexOf(`\r\n${marker}`, offset);
		if (next === -1) {
			throw new Error("composer MIME multipart terminator is missing");
		}
		parts.push(parseMimePart(source.slice(offset, next)));
		offset = next + 2 + marker.length;
		if (source.startsWith("--", offset)) {
			const epilogue = source.slice(offset + 2);
			if (epilogue !== "" && epilogue !== "\r\n") {
				throw new Error("composer MIME multipart epilogue is invalid");
			}
			return parts;
		}
		if (!source.startsWith("\r\n", offset)) {
			throw new Error("composer MIME multipart boundary is invalid");
		}
		offset += 2;
	}
}

interface ParameterizedHeader {
	value: string;
	parameters: Map<string, string>;
}

function parseParameterizedHeader(value: string): ParameterizedHeader {
	const segments = value.match(/(?:[^;"\\]|\\.|"(?:\\.|[^"])*")+/gu);
	if (segments === null || segments.length === 0) {
		throw new Error("composer MIME has an invalid parameterized header");
	}
	const parameters = new Map<string, string>();
	for (const segment of segments.slice(1)) {
		const equals = segment.indexOf("=");
		if (equals <= 0) {
			throw new Error("composer MIME has an invalid header parameter");
		}
		const name = segment.slice(0, equals).trim().toLowerCase();
		let parameter = segment.slice(equals + 1).trim();
		if (parameter.startsWith('"') && parameter.endsWith('"')) {
			parameter = parameter.slice(1, -1).replace(/\\(["\\])/gu, "$1");
		}
		if (parameters.has(name)) {
			throw new Error("composer MIME has a duplicate header parameter");
		}
		parameters.set(name, parameter);
	}
	return { value: segments[0]?.trim().toLowerCase() ?? "", parameters };
}

function requireParameter(header: ParameterizedHeader, name: string): string {
	const value = header.parameters.get(name);
	if (value === undefined || value === "") {
		throw new Error(`composer MIME requires a ${name} parameter`);
	}
	return value;
}

function projectAttachment(
	part: ParsedMimePart,
	parsed: NonNullable<Email["attachments"]>[number]
): MimeAttachment {
	const contentType = parseParameterizedHeader(
		requireSingleHeader(part.headers, "content-type")
	);
	const disposition = parseParameterizedHeader(
		requireSingleHeader(part.headers, "content-disposition")
	);
	if (
		contentType.value === "" ||
		(disposition.value !== "inline" && disposition.value !== "attachment") ||
		requireSingleHeader(
			part.headers,
			"content-transfer-encoding"
		).toLowerCase() !== "base64"
	) {
		throw new Error("composer attachment metadata is invalid");
	}
	const contentTypeFilename = requireParameter(contentType, "name");
	const filename = requireParameter(disposition, "filename");
	const normalized = normalizeBase64(part.body);
	if (
		normalized === undefined ||
		filename !== contentTypeFilename ||
		parsed.filename !== filename ||
		parsed.mimeType?.toLowerCase() !== contentType.value ||
		(parsed.disposition === "inline" ? "inline" : "attachment") !==
			disposition.value
	) {
		throw new Error("composer attachment does not match parsed MIME");
	}
	const contentIdHeader = part.headers.byName.get("content-id");
	const contentId = contentIdHeader?.[0];
	if ((contentIdHeader?.length ?? 0) > 1) {
		throw new Error("composer attachment has duplicate Content-ID headers");
	}
	const normalizedContentId = contentId?.replace(/^<|>$/gu, "");
	const parsedContentId = parsed.contentId?.replace(/^<|>$/gu, "");
	if (normalizedContentId !== parsedContentId) {
		throw new Error(
			"composer attachment Content-ID does not match parsed MIME"
		);
	}
	const decoded = Uint8Array.from(atob(normalized), (character) =>
		character.charCodeAt(0)
	);
	if (typeof parsed.content !== "string") {
		const parserBytes = new Uint8Array(parsed.content);
		if (
			parserBytes.byteLength !== decoded.byteLength ||
			parserBytes.some((byte, index) => byte !== decoded[index])
		) {
			throw new Error("composer attachment bytes do not match parsed MIME");
		}
	}
	return {
		filename,
		type: contentType.value,
		disposition: disposition.value,
		...(normalizedContentId === undefined
			? {}
			: { contentId: normalizedContentId }),
		content: normalized,
	};
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

	const generatedHeaderNames = new Set(
		Object.keys(generatedHeaders).map((name) => name.toLowerCase())
	);
	for (const [key, value] of Object.entries(message.headers ?? {})) {
		const normalizedKey = key.toLowerCase();
		if (
			isManagedEmailHeaderName(normalizedKey) ||
			generatedHeaderNames.has(normalizedKey)
		) {
			continue;
		}
		headers.push(`${key}: ${foldHeaderValue(value)}`);
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
	for (const name of Array.from(customHeaders.keys())) {
		if (
			isManagedEmailHeaderName(name) ||
			name === "in-reply-to" ||
			name === "references"
		) {
			customHeaders.delete(name);
		}
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
