import { readFileSync } from "node:fs";
import path from "node:path";
import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import { sendEmail } from "../client";
import { logSendResult } from "./utils";

export const emailSendingSendCommand = createCommand({
	metadata: {
		description: "Send an email using the Email Sending builder",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		from: {
			type: "string",
			demandOption: true,
			description: "Sender email address",
		},
		to: {
			type: "string",
			array: true,
			demandOption: true,
			description: "Recipient email address(es)",
		},
		subject: {
			type: "string",
			demandOption: true,
			description: "Email subject line",
		},
		text: {
			type: "string",
			description: "Plain text body of the email",
		},
		html: {
			type: "string",
			description: "HTML body of the email",
		},
		cc: {
			type: "string",
			array: true,
			description: "CC recipient email address(es)",
		},
		bcc: {
			type: "string",
			array: true,
			description: "BCC recipient email address(es)",
		},
		"reply-to": {
			type: "string",
			description: "Reply-to email address",
		},
		"from-name": {
			type: "string",
			description: "Display name for the sender (used with --from)",
		},
		"reply-to-name": {
			type: "string",
			description: "Display name for the reply-to address",
		},
		header: {
			type: "string",
			array: true,
			description:
				"Custom header in 'Key:Value' format. Can be specified multiple times.",
		},
		attachment: {
			type: "string",
			array: true,
			description: "File path to attach. Can be specified multiple times.",
		},
	},
	validateArgs: (args) => {
		if (!args.text && !args.html) {
			throw new UserError("At least one of --text or --html must be provided");
		}
	},
	async handler(args, { config }) {
		const from = args.fromName
			? { address: args.from, name: args.fromName }
			: args.from;

		const replyTo = args.replyTo
			? args.replyToName
				? { address: args.replyTo, name: args.replyToName }
				: args.replyTo
			: undefined;

		const headers = parseHeaders(args.header);
		const attachments = parseAttachments(args.attachment);

		const result = await sendEmail(config, {
			from,
			to: args.to.length === 1 ? args.to[0] : args.to,
			subject: args.subject,
			text: args.text,
			html: args.html,
			cc: args.cc,
			bcc: args.bcc,
			reply_to: replyTo,
			headers: headers.size > 0 ? Object.fromEntries(headers) : undefined,
			attachments: attachments.length > 0 ? attachments : undefined,
		});

		logSendResult(result);
	},
});

function parseHeaders(headerArgs: string[] | undefined): Map<string, string> {
	const headers = new Map<string, string>();
	if (!headerArgs) {
		return headers;
	}
	for (const h of headerArgs) {
		const colonIndex = h.indexOf(":");
		if (colonIndex === -1) {
			throw new UserError(
				`Invalid header format: '${h}'. Expected 'Key:Value'.`
			);
		}
		const key = h.slice(0, colonIndex).trim();
		const value = h.slice(colonIndex + 1).trim();
		if (!key) {
			throw new UserError(
				`Invalid header format: '${h}'. Header name cannot be empty.`
			);
		}
		headers.set(key, value);
	}
	return headers;
}

function parseAttachments(attachmentPaths: string[] | undefined): Array<{
	content: string;
	filename: string;
	type: string;
	disposition: "attachment";
}> {
	if (!attachmentPaths) {
		return [];
	}
	return attachmentPaths.map((filePath) => {
		let content: Buffer;
		try {
			content = readFileSync(filePath);
		} catch (e) {
			throw new UserError(
				`Failed to read attachment file '${filePath}': ${e instanceof Error ? e.message : e}`
			);
		}
		const filename = path.basename(filePath);

		return {
			content: content.toString("base64"),
			filename,
			type: guessMimeType(filename),
			disposition: "attachment" as const,
		};
	});
}

function guessMimeType(filename: string): string {
	const ext = filename.split(".").pop()?.toLowerCase();
	const mimeTypes: Record<string, string> = {
		txt: "text/plain",
		html: "text/html",
		htm: "text/html",
		css: "text/css",
		csv: "text/csv",
		json: "application/json",
		xml: "application/xml",
		pdf: "application/pdf",
		zip: "application/zip",
		gz: "application/gzip",
		tar: "application/x-tar",
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		gif: "image/gif",
		svg: "image/svg+xml",
		webp: "image/webp",
		ico: "image/x-icon",
		mp3: "audio/mpeg",
		mp4: "video/mp4",
		doc: "application/msword",
		docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		xls: "application/vnd.ms-excel",
		xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	};
	return mimeTypes[ext || ""] || "application/octet-stream";
}
