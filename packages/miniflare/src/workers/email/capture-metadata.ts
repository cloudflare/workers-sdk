import { formatParsedAddress } from "./address";
import type { StoredEmailAttachment } from "./storage";
import type { Email } from "postal-mime";

export interface ParsedEmailCaptureFields {
	cc?: string[];
	bcc?: string[];
	replyTo?: string;
	subject: string;
	headers: Record<string, string>;
	attachments: StoredEmailAttachment[];
}

export function contentByteLength(
	content: string | ArrayBuffer | ArrayBufferView
): number {
	if (typeof content === "string") {
		return new TextEncoder().encode(content).byteLength;
	}
	return content.byteLength;
}

export function getParsedEmailCaptureFields(
	email: Email,
	excludedHeaderNames: readonly string[] = []
): ParsedEmailCaptureFields {
	const excludedHeaders = new Set(
		excludedHeaderNames.map((name) => name.toLowerCase())
	);
	return {
		cc: email.cc?.map(formatParsedAddress),
		bcc: email.bcc?.map(formatParsedAddress),
		replyTo: email.replyTo
			? email.replyTo.map(formatParsedAddress).join(", ")
			: undefined,
		subject: email.subject ?? "(no subject)",
		headers: Object.fromEntries(
			email.headers
				.filter(({ key }) => !excludedHeaders.has(key.toLowerCase()))
				.map(({ key, value }) => [key, value])
		),
		attachments: (email.attachments ?? []).map((attachment) => ({
			filename: attachment.filename ?? "attachment",
			contentType: attachment.mimeType ?? "application/octet-stream",
			disposition:
				attachment.disposition === "inline" ? "inline" : "attachment",
			size: contentByteLength(attachment.content),
		})),
	};
}
