import { UserError } from "@cloudflare/workers-utils";
import { readFileSync } from "node:fs";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { sendRawEmail } from "../client";

export const emailSendingSendRawCommand = createCommand({
	metadata: {
		description: "Send a raw MIME email message",
		status: "open beta",
		owner: "Product: Email Service",
	},
	args: {
		from: {
			type: "string",
			demandOption: true,
			description: "Sender email address (SMTP envelope)",
		},
		to: {
			type: "string",
			array: true,
			demandOption: true,
			description: "Recipient email address(es) (SMTP envelope)",
		},
		mime: {
			type: "string",
			description:
				"Raw MIME message string. Provide either --mime or --mime-file, not both.",
			conflicts: ["mime-file"],
		},
		"mime-file": {
			type: "string",
			description:
				"Path to a file containing the raw MIME message. Provide either --mime or --mime-file, not both.",
			conflicts: ["mime"],
		},
	},
	validateArgs: (args) => {
		if (!args.mime && !args.mimeFile) {
			throw new UserError(
				"You must provide either --mime (inline MIME message) or --mime-file (path to MIME file)"
			);
		}
	},
	async handler(args, { config }) {
		let mimeMessage: string;

		if (args.mimeFile) {
			try {
				mimeMessage = readFileSync(args.mimeFile, "utf-8");
			} catch (e) {
				throw new UserError(
					`Failed to read MIME file '${args.mimeFile}': ${e instanceof Error ? e.message : e}`
				);
			}
		} else {
			mimeMessage = args.mime ?? "";
		}

		const result = await sendRawEmail(config, {
			from: args.from,
			recipients: args.to,
			mime_message: mimeMessage,
		});

		if (result.delivered.length > 0) {
			logger.log(`✅ Delivered to: ${result.delivered.join(", ")}`);
		}
		if (result.queued.length > 0) {
			logger.log(`📬 Queued for: ${result.queued.join(", ")}`);
		}
		if (result.permanent_bounces.length > 0) {
			logger.warn(
				`Permanently bounced: ${result.permanent_bounces.join(", ")}`
			);
		}
		if (
			result.delivered.length === 0 &&
			result.queued.length === 0 &&
			result.permanent_bounces.length === 0
		) {
			logger.log("✅ Email sent successfully.");
		}
	},
});
