import { UserError } from "@cloudflare/workers-utils";
import { readFileSync } from "fs";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { sendEmail } from "../client";

export const emailSendingSendCommand = createCommand({
	metadata: {
		description: "Send an email using the Email Sending builder",
		status: "open-beta",
		owner: "Product: Email Routing",
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
			description:
				"File path to attach. Can be specified multiple times.",
		},
	},
	validateArgs: (args) => {
		if (!args.text && !args.html) {
			throw new UserError(
				"At least one of --text or --html must be provided"
			);
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

		if (result.delivered.length > 0) {
			logger.log(`Delivered to: ${result.delivered.join(", ")}`);
		}
		if (result.queued.length > 0) {
			logger.log(`Queued for: ${result.queued.join(", ")}`);
		}
		if (result.permanent_bounces.length > 0) {
			logger.warn(
				`Permanently bounced: ${result.permanent_bounces.join(", ")}`
			);
		}
	},
});

function parseHeaders(
	headerArgs: string[] | undefined
): Map<string, string> {
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
		headers.set(h.slice(0, colonIndex).trim(), h.slice(colonIndex + 1).trim());
	}
	return headers;
}

function parseAttachments(
	attachmentPaths: string[] | undefined
): Array<{
	content: string;
	filename: string;
	type: string;
	disposition: "attachment";
}> {
	if (!attachmentPaths) {
		return [];
	}
	return attachmentPaths.map((filePath) => {
		const content = readFileSync(filePath);
		const filename = filePath.split("/").pop() || filePath;

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
