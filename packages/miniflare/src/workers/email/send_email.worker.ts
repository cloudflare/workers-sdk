import { WorkerEntrypoint } from "cloudflare:workers";
import { blue } from "kleur/colors";
import { LogLevel, SharedHeaders } from "miniflare:shared";
import PostalMime, { Email } from "postal-mime";
import { CoreBindings } from "../core/constants";
import { RAW_EMAIL } from "./constants";
import { type MiniflareEmailMessage as EmailMessage } from "./email.worker";
import type { EmailAddress, MessageBuilder } from "./types";

/**
 * Extracts email address from string or EmailAddress object
 */
function extractEmailAddress(addr: string | EmailAddress): string {
	return typeof addr === "string" ? addr : addr.email;
}

/**
 * Formats an email address for display
 */
function formatEmailAddress(addr: string | EmailAddress): string {
	if (typeof addr === "string") {
		return addr;
	}
	return `"${addr.name}" <${addr.email}>`;
}

/**
 * Formats a MessageBuilder for logging
 */
function formatMessageBuilder(builder: MessageBuilder): string {
	const lines: string[] = [];

	lines.push("From: " + formatEmailAddress(builder.from));

	const toArray = Array.isArray(builder.to) ? builder.to : [builder.to];
	lines.push("To: " + toArray.map(formatEmailAddress).join(", "));

	if (builder.cc) {
		const ccArray = Array.isArray(builder.cc) ? builder.cc : [builder.cc];
		lines.push("Cc: " + ccArray.map(formatEmailAddress).join(", "));
	}

	if (builder.bcc) {
		const bccArray = Array.isArray(builder.bcc) ? builder.bcc : [builder.bcc];
		lines.push("Bcc: " + bccArray.map(formatEmailAddress).join(", "));
	}

	lines.push("Subject: " + builder.subject);

	return lines.join("\n");
}

interface SendEmailEnv {
	[CoreBindings.SERVICE_LOOPBACK]: Fetcher;
	destination_address: string | undefined;
	allowed_destination_addresses: string[] | undefined;
	allowed_sender_addresses: string[] | undefined;
}

export class SendEmailBinding extends WorkerEntrypoint<SendEmailEnv> {
	/**
	 * Logs a message via the loopback service
	 */
	private log(message: string, level: LogLevel = LogLevel.INFO): void {
		this.ctx.waitUntil(
			this.env[CoreBindings.SERVICE_LOOPBACK].fetch(
				"http://localhost/core/log",
				{
					method: "POST",
					headers: { [SharedHeaders.LOG_LEVEL]: level.toString() },
					body: message,
				}
			)
		);
	}
	/**
	 * Stores content to a temporary file via the loopback service
	 */
	private async storeTempFile(
		content: string | ArrayBuffer | ArrayBufferView,
		extension: string,
		prefix: string
	): Promise<string> {
		let body: string | Uint8Array;
		if (typeof content === "string") {
			body = content;
		} else if (content instanceof ArrayBuffer) {
			body = new Uint8Array(content);
		} else {
			// ArrayBufferView
			body = new Uint8Array(
				content.buffer,
				content.byteOffset,
				content.byteLength
			);
		}

		const resp = await this.env[CoreBindings.SERVICE_LOOPBACK].fetch(
			`http://localhost/core/store-temp-file?extension=${extension}&prefix=${prefix}`,
			{
				method: "POST",
				body,
			}
		);
		return await resp.text();
	}

	private checkDestinationAllowed(to: string) {
		if (
			this.env.destination_address !== undefined &&
			to !== this.env.destination_address
		) {
			throw new Error(`email to ${to} not allowed`);
		}

		if (
			this.env.allowed_destination_addresses !== undefined &&
			!this.env.allowed_destination_addresses.includes(to)
		) {
			throw new Error(`email to ${to} not allowed`);
		}
	}
	private checkSenderAllowed(from: string) {
		if (
			this.env.allowed_sender_addresses !== undefined &&
			!this.env.allowed_sender_addresses.includes(from)
		) {
			throw new Error(`email from ${from} not allowed`);
		}
	}

	/**
	 * Type guard to check if argument is an EmailMessage (has RAW_EMAIL symbol)
	 */
	private isEmailMessage(
		arg: EmailMessage | MessageBuilder
	): arg is EmailMessage {
		return RAW_EMAIL in arg;
	}

	/**
	 * Validates recipients against binding configuration
	 */
	private validateRecipients(recipients: string | string[]): void {
		const recipientArray = Array.isArray(recipients)
			? recipients
			: [recipients];
		for (const recipient of recipientArray) {
			this.checkDestinationAllowed(recipient);
		}
	}

	/**
	 * Validates MessageBuilder against binding configuration
	 */
	private validateMessageBuilder(builder: MessageBuilder): void {
		// Check sender is allowed
		const fromEmail = extractEmailAddress(builder.from);
		this.checkSenderAllowed(fromEmail);

		// Check "to" recipients are allowed (same as EmailMessage - only validate "to")
		// Extract email addresses from potential EmailAddress objects
		const toArray = Array.isArray(builder.to) ? builder.to : [builder.to];
		const toEmails = toArray.map((addr) => extractEmailAddress(addr));
		this.validateRecipients(toEmails);
	}

	async send(
		emailMessageOrBuilder: EmailMessage | MessageBuilder
	): Promise<void> {
		// Check if this is an EmailMessage (has RAW_EMAIL symbol) or MessageBuilder
		if (this.isEmailMessage(emailMessageOrBuilder)) {
			// Original EmailMessage API - validate and parse MIME
			const emailMessage = emailMessageOrBuilder;
			this.checkSenderAllowed(emailMessage.from);
			this.validateRecipients(emailMessage.to);

			const rawEmail: ReadableStream<Uint8Array> = emailMessage[RAW_EMAIL];
			const rawEmailBuffer = new Uint8Array(
				await new Response(rawEmail).arrayBuffer()
			);

			let parsedEmail: Email;

			try {
				parsedEmail = await PostalMime.parse(rawEmailBuffer);
			} catch (e) {
				const error = e as Error;
				throw new Error(`could not parse email: ${error.message}`);
			}

			if (parsedEmail.messageId === undefined) {
				throw new Error("invalid message-id");
			}

			let emailHeaders: Headers;
			try {
				emailHeaders = new Headers(
					parsedEmail.headers.map((header) => [header.key, header.value])
				);
			} catch (e) {
				const error = e as Error;
				throw new Error(`could not parse email: ${error.message}`);
			}

			if (emailMessage.from !== parsedEmail.from.address) {
				throw new Error("From: header does not match mail from");
			}

			if (emailHeaders.get("received") !== null) {
				throw new Error("invalid headers set");
			}

			const file = await this.storeTempFile(rawEmailBuffer, "eml", "email");

			this.log(
				`${blue("send_email binding called with the following message:")}\n  ${file}`
			);
		} else {
			// New MessageBuilder API - just validate and log
			const builder = emailMessageOrBuilder;

			// Validate the message builder
			this.validateMessageBuilder(builder);

			// Store text, HTML content, and attachments to files for easy viewing
			const files: string[] = [];

			if (builder.text) {
				const filePath = await this.storeTempFile(
					builder.text,
					"txt",
					"email-text"
				);
				files.push(`Text: ${filePath}`);
			}

			if (builder.html) {
				const filePath = await this.storeTempFile(
					builder.html,
					"html",
					"email-html"
				);
				files.push(`HTML: ${filePath}`);
			}

			// Store attachments
			if (builder.attachments) {
				for (const attachment of builder.attachments) {
					// Extract file extension from filename or use generic extension
					const extMatch = attachment.filename.match(/\.([^.]+)$/);
					const extension = extMatch ? extMatch[1] : "bin";

					const filePath = await this.storeTempFile(
						attachment.content,
						extension,
						"email-attachment"
					);
					files.push(
						`Attachment (${attachment.disposition}): ${attachment.filename} -> ${filePath}`
					);
				}
			}

			// Format and log the message details with file paths
			const formatted = formatMessageBuilder(builder);
			const fileInfo = files.length > 0 ? `\n\n${files.join("\n")}` : "";
			this.log(
				`${blue("send_email binding called with MessageBuilder:")}\n${formatted}${fileInfo}`
			);
		}
	}
}
