import { WorkerEntrypoint } from "cloudflare:workers";
import { $, blue } from "kleur/colors";
import { LogLevel, SharedHeaders } from "miniflare:shared";
import PostalMime from "postal-mime";
import { RAW_EMAIL } from "./constants";
import { type MiniflareEmailMessage as EmailMessage } from "./email.worker";
import type { StoredSendingAttachment, StoredSendingEmail } from "./storage";
import type { EmailAddress, MessageBuilder } from "./types";
import type { Email } from "postal-mime";

// Force-enable colours.
$.enabled = true;

/**
 * Build a Message-ID in the shape the production `send_email` binding returns:
 * `<{random alphanumeric chars}@{sender domain}>`.
 */
function synthesizeMessageId(senderEmail: string): string {
	const id = Math.random().toString(36).slice(2);
	const domain = senderEmail.slice(senderEmail.lastIndexOf("@") + 1);
	return `<${id}@${domain}>`;
}

/**
 * Derives the stoage id from the email's message id
 * (<id>@<domain>.com becomes <id>@<domain>.
 */
function messageIdToStorageId(messageId: string): string {
	const content = messageId.slice(1, -1);
	const lastDot = content.lastIndexOf(".");
	return lastDot === -1 ? content : content.slice(0, lastDot);
}

/**
 * Extracts the bare email address from a string (which may be in
 * `"Name" <address>` or plain address format) or EmailAddress object.
 */
function extractEmailAddress(addr: string | EmailAddress): string {
	if (typeof addr !== "string") {
		return addr.email;
	}
	// Match "Name" <address> or Name <address> or just address
	const match = addr.match(/<([^>]+)>$/);
	return match ? match[1].trim() : addr.trim();
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
	destination_address: string | undefined;
	allowed_destination_addresses: string[] | undefined;
	allowed_sender_addresses: string[] | undefined;
	MINIFLARE_LOOPBACK: Fetcher;
}

export class SendEmailBinding extends WorkerEntrypoint<SendEmailEnv> {
	/**
	 * Logs a message via the loopback `/core/log` endpoint.
	 */
	private async log(message: string): Promise<void> {
		await this.env.MINIFLARE_LOOPBACK.fetch("http://localhost/core/log", {
			method: "POST",
			headers: { [SharedHeaders.LOG_LEVEL]: LogLevel.INFO.toString() },
			body: message,
		});
	}

	/**
	 * Reports a sent email to the local explorer.
	 */
	private async reportSentEmail(email: StoredSendingEmail): Promise<void> {
		try {
			await this.env.MINIFLARE_LOOPBACK.fetch(
				"http://localhost/core/email-sending",
				{
					method: "POST",
					body: JSON.stringify(email satisfies StoredSendingEmail),
				}
			);
		} catch {
			// Ignore reporting failures.
		}
	}
	/**
	 * Persists email content to a temp file via the loopback
	 * `/core/store-temp-file` endpoint and returns the on-disk path.
	 */
	private async storeTempFile(
		content: string | ArrayBuffer | ArrayBufferView,
		extension: string,
		prefix: string,
		id?: string
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

		const params = new URLSearchParams({ prefix, extension });
		if (id !== undefined) {
			params.set("id", id);
		}

		const resp = await this.env.MINIFLARE_LOOPBACK.fetch(
			`http://localhost/core/store-temp-file?${params.toString()}`,
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
	): Promise<EmailSendResult> {
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

			// Derive the storage id from the email's message-id so the on-disk filename
			// matches the id shown in the local explorer.
			const messageId =
				parsedEmail.messageId ?? synthesizeMessageId(emailMessage.from);
			const id = messageIdToStorageId(messageId);

			const filePath = await this.storeTempFile(
				rawEmailBuffer,
				"eml",
				"email",
				id
			);

			const fileInfo = `Email: ${filePath}`;
			await this.log(
				`${blue("send_email binding called with the following message:")}\n${fileInfo}`
			);

			await this.reportSentEmail({
				id,
				from: emailMessage.from,
				to: [emailMessage.to],
				subject: parsedEmail.subject ?? "(no subject)",
				sentAt: new Date().toISOString(),
				messageId,
				text: parsedEmail.text,
				html: parsedEmail.html,
				attachments: (parsedEmail.attachments ?? []).map((attachment) => ({
					filename: attachment.filename ?? "attachment",
					contentType: attachment.mimeType ?? "application/octet-stream",
					disposition:
						attachment.disposition === "inline" ? "inline" : "attachment",
					size:
						typeof attachment.content === "string"
							? attachment.content.length
							: attachment.content.byteLength,
				})),
				raw: new TextDecoder().decode(rawEmailBuffer),
			});

			return { messageId };
		} else {
			// New MessageBuilder API - just validate and log
			const builder = emailMessageOrBuilder;

			// Validate the message builder
			this.validateMessageBuilder(builder);

			// Derive the storage id from the synthesized message-id so the on-disk filenames
			// match the id shown in the local explorer.
			const messageId = synthesizeMessageId(extractEmailAddress(builder.from));
			const id = messageIdToStorageId(messageId);

			// Store text, HTML content, and attachments to files for easy viewing
			const files: string[] = [];

			if (builder.text) {
				const textPath = await this.storeTempFile(
					builder.text,
					"txt",
					"email-text",
					id
				);
				files.push(`Text: ${textPath}`);
			}

			if (builder.html) {
				const htmlPath = await this.storeTempFile(
					builder.html,
					"html",
					"email-html",
					id
				);
				files.push(`HTML: ${htmlPath}`);
			}

			// Store attachments
			const sentAttachments: StoredSendingAttachment[] = [];
			if (builder.attachments) {
				for (const attachment of builder.attachments) {
					// Extract file extension from filename or use generic extension
					const extMatch = attachment.filename.match(/\.([^.]+)$/);
					const extension = extMatch ? extMatch[1] : "bin";
					const attachmentUUID = crypto.randomUUID();

					const attachmentPath = await this.storeTempFile(
						attachment.content,
						extension,
						"email-attachment",
						attachmentUUID
					);
					files.push(
						`Attachment (${attachment.disposition}): ${attachment.filename} -> ${attachmentPath}`
					);
					sentAttachments.push({
						filename: attachment.filename,
						contentType: attachment.type,
						disposition: attachment.disposition,
						size:
							typeof attachment.content === "string"
								? attachment.content.length
								: attachment.content.byteLength,
					});
				}
			}

			// Format and log the message details with file paths
			const formatted = formatMessageBuilder(builder);
			const fileInfo = files.length > 0 ? `\n\n${files.join("\n")}` : "";
			await this.log(
				`${blue("send_email binding called with MessageBuilder:")}\n${formatted}${fileInfo}`
			);

			const toDisplay = (
				addr: string | EmailAddress | (string | EmailAddress)[]
			): string[] =>
				(Array.isArray(addr) ? addr : [addr]).map(formatEmailAddress);

			await this.reportSentEmail({
				id,
				from: formatEmailAddress(builder.from),
				to: toDisplay(builder.to),
				cc: builder.cc ? toDisplay(builder.cc) : undefined,
				bcc: builder.bcc ? toDisplay(builder.bcc) : undefined,
				replyTo: builder.replyTo
					? formatEmailAddress(builder.replyTo)
					: undefined,
				subject: builder.subject,
				sentAt: new Date().toISOString(),
				messageId,
				text: builder.text,
				html: builder.html,
				headers: builder.headers,
				attachments: sentAttachments,
			});

			return { messageId };
		}
	}
}
