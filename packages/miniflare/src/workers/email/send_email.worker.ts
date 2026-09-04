import { WorkerEntrypoint } from "cloudflare:workers";
import { $, blue } from "kleur/colors";
import { LogLevel } from "miniflare:shared";
import PostalMime from "postal-mime";
import { CoreBindings } from "../core/constants";
import { extractEmailAddress, formatEmailAddress } from "./address";
import {
	captureRawForJsonRow,
	captureTextAndHtmlForJsonRow,
	RAW_EMAIL,
} from "./capture";
import {
	contentByteLength,
	getParsedEmailCaptureFields,
} from "./capture-metadata";
import { type MiniflareEmailMessage as EmailMessage } from "./email.worker";
import { logEmailToLoopback, storeEmailTempFile } from "./loopback";
import {
	messageIdToStorageId,
	setMessageIdHeader,
	synthesizeMessageId,
} from "./message-id";
import type {
	EmailStoreService,
	StoredEmailAttachment,
	StoredSendingEmail,
} from "./storage";
import type { EmailAddress, MessageBuilder } from "./types";
import type { Email } from "postal-mime";

// Force-enable colours.
$.enabled = true;

// Cap the extension length so a pathological filename (e.g. `file.` followed
// by thousands of chars) can't produce a temp-file suffix that overruns the
// filesystem's name-length limit.
const MAX_ATTACHMENT_EXTENSION_LENGTH = 32;

function getAttachmentExtension(filename: string): string {
	const extension = filename.match(/\.([^.]+)$/u)?.[1];
	return extension !== undefined &&
		extension.length <= MAX_ATTACHMENT_EXTENSION_LENGTH &&
		/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(extension)
		? extension
		: "bin";
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
	destinationAddress: string | undefined;
	allowedDestinationAddresses: string[] | undefined;
	allowedSenderAddresses: string[] | undefined;
	MINIFLARE_LOOPBACK: Fetcher;
	[CoreBindings.SERVICE_EMAIL_STORE]: EmailStoreService;
	/** Worker that owns this send_email binding. */
	SEND_EMAIL_OWNER_WORKER: string;
}

export class SendEmailBinding extends WorkerEntrypoint<SendEmailEnv> {
	/**
	 * Logs a message via the loopback `/core/log` endpoint.
	 */
	private async log(
		message: string,
		level: LogLevel = LogLevel.INFO
	): Promise<void> {
		await logEmailToLoopback(this.env.MINIFLARE_LOOPBACK, message, level);
	}

	/**
	 * Builds and captures a sent email into the local email store for the explorer.
	 *
	 * Capture is a dev-only inspection aid: any failure here (row budgeting,
	 * store RPC) is swallowed so it never affects the result of `send()`.
	 */
	private async captureSentEmail(
		build: () => { email: StoredSendingEmail; truncated: boolean }
	): Promise<void> {
		try {
			const captured = build();
			await this.env[CoreBindings.SERVICE_EMAIL_STORE].storeSent(
				captured.email
			);
		} catch {
			this.ctx.waitUntil(
				this.log(
					"Failed to capture sent email for the Local Explorer; the email was still sent.",
					LogLevel.WARN
				).catch(() => {
					// Capture failures must not affect sending.
				})
			);
		}
	}
	/**
	 * Persists email content to a temp file via the loopback
	 * `/core/store-temp-file` endpoint and returns the on-disk path.
	 *
	 * Uses the email prefix so the file lands in the email directories and is
	 * mirrored into the project directory.
	 *
	 * `id` names the file.
	 */
	private async storeTempFile(
		content: string | ArrayBuffer | ArrayBufferView,
		extension: string,
		prefix: string,
		id: string
	): Promise<string> {
		const resp = await storeEmailTempFile(
			this.env.MINIFLARE_LOOPBACK,
			content,
			{
				prefix: `email/${prefix}`,
				extension,
				id,
			}
		);

		const text = await resp.text();
		if (!resp.ok) {
			// A non-2xx body is an error message, not a path; surface it so the
			// caller doesn't log an error string as if it were a file path.
			throw new Error(`could not store email temporary file: ${text}`);
		}
		return text;
	}

	private checkDestinationAllowed(to: string) {
		if (
			this.env.destinationAddress !== undefined &&
			to !== this.env.destinationAddress
		) {
			throw new Error(`email to ${to} not allowed`);
		}

		if (
			this.env.allowedDestinationAddresses !== undefined &&
			!this.env.allowedDestinationAddresses.includes(to)
		) {
			throw new Error(`email to ${to} not allowed`);
		}
	}
	private checkSenderAllowed(from: string) {
		if (
			this.env.allowedSenderAddresses !== undefined &&
			!this.env.allowedSenderAddresses.includes(from)
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

			// Always synthesise new ID for user sent emails.
			const messageId = synthesizeMessageId(emailMessage.from);
			const id = messageIdToStorageId(messageId);
			const normalizedRawEmailBuffer = setMessageIdHeader(
				rawEmailBuffer,
				messageId
			);
			const normalizedParsedEmail = await PostalMime.parse(
				normalizedRawEmailBuffer
			);

			// Complete the workerd-side capture before resolving send(). File writes
			// remain deferred because they cross the Node loopback service.
			await this.captureSentEmail(() =>
				captureRawForJsonRow(
					{
						worker: this.env.SEND_EMAIL_OWNER_WORKER,
						from: emailMessage.from,
						to: [emailMessage.to],
						...getParsedEmailCaptureFields(normalizedParsedEmail),
						sentAt: new Date().toISOString(),
						messageId,
					},
					normalizedRawEmailBuffer,
					true
				)
			);

			this.ctx.waitUntil(
				(async () => {
					const filePath = await this.storeTempFile(
						normalizedRawEmailBuffer,
						"eml",
						"email",
						id
					);
					await this.log(
						`${blue("send_email binding called with the following message:")}\nEmail: ${filePath}`
					);
				})().catch(async (error: unknown) => {
					try {
						await this.log(`Failed to persist sent email: ${String(error)}`);
					} catch {
						// Logging failures must not create another unhandled rejection.
					}
				})
			);

			return { messageId };
		} else {
			// New MessageBuilder API - just validate and log
			const builder = emailMessageOrBuilder;

			// Validate the message builder
			this.validateMessageBuilder(builder);

			// Always synthesise new ID for user sent emails.
			const messageId = synthesizeMessageId(extractEmailAddress(builder.from));
			const id = messageIdToStorageId(messageId);

			function toDisplay(
				addr: string | EmailAddress | (string | EmailAddress)[]
			): string[] {
				return (Array.isArray(addr) ? addr : [addr]).map(formatEmailAddress);
			}

			const sentAttachments: StoredEmailAttachment[] = (
				builder.attachments ?? []
			).map((attachment) => ({
				filename: attachment.filename,
				contentType: attachment.type,
				disposition: attachment.disposition ?? "attachment",
				size: contentByteLength(attachment.content),
			}));

			// Complete the workerd-side capture before resolving send()
			await this.captureSentEmail(() =>
				captureTextAndHtmlForJsonRow(
					{
						worker: this.env.SEND_EMAIL_OWNER_WORKER,
						from: formatEmailAddress(builder.from),
						to: toDisplay(builder.to),
						cc: builder.cc ? toDisplay(builder.cc) : undefined,
						bcc: builder.bcc ? toDisplay(builder.bcc) : undefined,
						replyTo: builder.replyTo
							? formatEmailAddress(builder.replyTo)
							: undefined,
						subject: builder.subject ?? "(no subject)",
						sentAt: new Date().toISOString(),
						messageId,
						headers: builder.headers,
						attachments: sentAttachments,
					},
					builder.text,
					builder.html,
					true
				)
			);

			// Persist file artifacts independently of the new email record.
			this.ctx.waitUntil(
				(async () => {
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

					if (builder.attachments) {
						for (const [index, attachment] of builder.attachments.entries()) {
							const extension = getAttachmentExtension(attachment.filename);

							const attachmentPath = await this.storeTempFile(
								attachment.content,
								extension,
								"email-attachment",
								`${id}-${index + 1}`
							);
							files.push(
								`Attachment (${attachment.disposition ?? "attachment"}): ${attachment.filename} -> ${attachmentPath}`
							);
						}
					}

					const formatted = formatMessageBuilder(builder);
					const fileInfo = files.length > 0 ? `\n\n${files.join("\n")}` : "";
					await this.log(
						`${blue("send_email binding called with MessageBuilder:")}\n${formatted}${fileInfo}`
					);
				})().catch(async (error: unknown) => {
					try {
						await this.log(`Failed to persist sent email: ${String(error)}`);
					} catch {
						// Logging failures must not create another unhandled rejection.
					}
				})
			);

			return { messageId };
		}
	}
}
