import { WorkerEntrypoint } from "cloudflare:workers";
import { $, blue } from "kleur/colors";
import { LogLevel, SharedHeaders } from "miniflare:shared";
import PostalMime from "postal-mime";
import { CoreBindings } from "../core/constants";
import {
	MAX_LOCAL_EMAIL_BYTES,
	RAW_EMAIL,
	truncateRawForCapture,
	truncateStringForCapture,
} from "./capture";
import { type MiniflareEmailMessage as EmailMessage } from "./email.worker";
import { messageIdToStorageId, synthesizeMessageId } from "./message-id";
import type {
	EmailArtifact,
	EmailStoreService,
	StoredEmailAttachment,
	StoredSendingEmail,
} from "./storage";
import type { EmailAddress, MessageBuilder } from "./types";
import type { Email } from "postal-mime";

// Force-enable colours.
$.enabled = true;

/**
 * Byte length of email content, so attachment sizes are accurate for
 * multi-byte payloads (string `.length` counts UTF-16 code units, not bytes).
 */
function contentByteLength(
	content: string | ArrayBuffer | ArrayBufferView
): number {
	if (typeof content === "string") {
		return new TextEncoder().encode(content).byteLength;
	}
	return content.byteLength;
}

function getAttachmentExtension(filename: string): string {
	const extension = filename.match(/\.([^.]+)$/u)?.[1];
	return extension !== undefined &&
		/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(extension)
		? extension
		: "bin";
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

function formatParsedAddress(addr: {
	address?: string;
	name?: string;
}): string {
	const email = addr.address ?? "";
	return addr.name === undefined || addr.name === ""
		? email
		: `"${addr.name}" <${email}>`;
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
	[CoreBindings.SERVICE_EMAIL_STORE]?: EmailStoreService;
	/** Worker that owns this send_email binding, set when the local explorer is enabled. */
	SEND_EMAIL_OWNER_WORKER?: string;
}

export class SendEmailBinding extends WorkerEntrypoint<SendEmailEnv> {
	/**
	 * Logs a message via the loopback `/core/log` endpoint.
	 */
	private async log(
		message: string,
		level: LogLevel = LogLevel.INFO
	): Promise<void> {
		await this.env.MINIFLARE_LOOPBACK.fetch("http://localhost/core/log", {
			method: "POST",
			headers: { [SharedHeaders.LOG_LEVEL]: level.toString() },
			body: message,
		});
	}

	/**
	 * Warns (via the loopback log) that an oversized message was truncated for
	 * capture. Delivery is unaffected — only the Local Explorer copy is trimmed.
	 */
	private async warnTruncated(): Promise<void> {
		try {
			await this.log(
				`Email exceeds the ${MAX_LOCAL_EMAIL_BYTES}-byte local capture limit; the email was sent, but only the first ${MAX_LOCAL_EMAIL_BYTES} bytes are shown in the Local Explorer.`,
				LogLevel.WARN
			);
		} catch {
			// Logging failures must not affect sending.
		}
	}

	/**
	 * Captures a sent email into the local email store for the explorer.
	 *
	 * Capture is a dev-only inspection aid: any failure here (store unbound,
	 * RPC error) is swallowed so it never affects the result of `send()`. When
	 * the store is unbound (local explorer disabled) this is a no-op. Large raw
	 * bodies are streamed in 64 KB base64 slices to stay under workerd's RPC
	 * argument cap, mirroring the received path.
	 */
	private async reportSentEmail(
		email: StoredSendingEmail
	): Promise<EmailArtifact[]> {
		const store = this.env[CoreBindings.SERVICE_EMAIL_STORE];
		if (store === undefined) {
			return [];
		}
		try {
			const rawBase64 = email.rawBase64;
			if (rawBase64 !== undefined && rawBase64.length > 64 * 1024) {
				const { raw: _raw, rawBase64: _rawBase64, ...metadata } = email;
				const id = messageIdToStorageId(email.messageId);
				await store.beginSent(metadata);
				try {
					for (let offset = 0; offset < rawBase64.length; offset += 64 * 1024) {
						await store.appendSentRaw(
							id,
							rawBase64.slice(offset, offset + 64 * 1024)
						);
					}
					return await store.finishSent(id);
				} catch (error) {
					await store.discardSent(id).catch(() => undefined);
					throw error;
				}
			}
			return await store.storeSent(email);
		} catch {
			try {
				await this.log(
					"Failed to capture sent email for the Local Explorer; the email was still sent.",
					LogLevel.WARN
				);
			} catch {
				// Capture failures must not affect sending.
			}
			return [];
		}
	}

	private async removeSentArtifacts(artifacts: EmailArtifact[]): Promise<void> {
		if (artifacts.length === 0) {
			return;
		}
		const response = await this.env.MINIFLARE_LOOPBACK.fetch(
			"http://localhost/core/delete-email-temp-files",
			{
				method: "POST",
				body: JSON.stringify({ artifacts } satisfies {
					artifacts: EmailArtifact[];
				}),
			}
		);
		if (!response.ok) {
			throw new Error(
				`could not delete email temporary files: ${await response.text()}`
			);
		}
	}
	/**
	 * Persists email content to a temp file via the loopback
	 * `/core/store-temp-file` endpoint and returns the on-disk path.
	 *
	 * Always requests the endpoint's email mode so the file lands in the email
	 * directories and is mirrored into the project directory.
	 *
	 * `id` names the file, and is always derived from the message's id so every
	 * file belonging to a message can be found from the id the local explorer
	 * shows.
	 */
	private async storeTempFile(
		content: string | ArrayBuffer | ArrayBufferView,
		extension: string,
		prefix: string,
		id: string,
		recordId = id
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

		const params = new URLSearchParams({
			prefix,
			extension,
			email: "true",
			id,
			record: recordId,
		});

		const resp = await this.env.MINIFLARE_LOOPBACK.fetch(
			`http://localhost/core/store-temp-file?${params.toString()}`,
			{
				method: "POST",
				body,
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

			// Always synthesise new ID for user sent emails.
			const messageId = synthesizeMessageId(emailMessage.from);
			const id = messageIdToStorageId(messageId);

			// Capture only up to the local limit; delivery uses the full body. The
			// captured copy (store record and on-disk .eml) is trimmed to keep the
			// workerd-internal RPC argument under its ~1 MiB cap.
			const capturedRaw = truncateRawForCapture(rawEmailBuffer);
			if (capturedRaw.truncated) {
				await this.warnTruncated();
			}

			// Complete the workerd-side capture before resolving send(). File writes
			// remain deferred because they cross the Node loopback service.
			const evictedArtifacts = await this.reportSentEmail({
				worker: this.env.SEND_EMAIL_OWNER_WORKER,
				from: emailMessage.from,
				to: [emailMessage.to],
				cc: parsedEmail.cc?.map(formatParsedAddress),
				bcc: parsedEmail.bcc?.map(formatParsedAddress),
				replyTo: parsedEmail.replyTo
					? parsedEmail.replyTo.map(formatParsedAddress).join(", ")
					: undefined,
				subject: parsedEmail.subject ?? "(no subject)",
				sentAt: new Date().toISOString(),
				messageId,
				headers: Object.fromEntries(
					parsedEmail.headers.map(({ key, value }) => [key, value])
				),
				// `text`/`html` are derived views of the raw body (the full copy is
				// preserved via `rawBase64`), and travel in the metadata prelude
				// that precedes the streamed raw body. Cap them well under
				// workerd's RPC argument limit so the prelude always fits.
				text:
					parsedEmail.text === undefined
						? undefined
						: truncateStringForCapture(parsedEmail.text, 64 * 1024).value,
				html:
					parsedEmail.html === undefined
						? undefined
						: truncateStringForCapture(parsedEmail.html, 64 * 1024).value,
				attachments: (parsedEmail.attachments ?? []).map((attachment) => ({
					filename: attachment.filename ?? "attachment",
					contentType: attachment.mimeType ?? "application/octet-stream",
					disposition:
						attachment.disposition === "inline" ? "inline" : "attachment",
					size: contentByteLength(attachment.content),
				})),
				raw: capturedRaw.raw,
				rawBase64: capturedRaw.rawBase64,
			});

			this.ctx.waitUntil(
				(async () => {
					const filePath = await this.storeTempFile(
						rawEmailBuffer,
						"eml",
						"email",
						id,
						id
					);
					await this.removeSentArtifacts(evictedArtifacts);
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

			const toDisplay = (
				addr: string | EmailAddress | (string | EmailAddress)[]
			): string[] =>
				(Array.isArray(addr) ? addr : [addr]).map(formatEmailAddress);

			const sentAttachments: StoredEmailAttachment[] = (
				builder.attachments ?? []
			).map((attachment) => ({
				filename: attachment.filename,
				contentType: attachment.type,
				disposition: attachment.disposition,
				size: contentByteLength(attachment.content),
			}));

			// A MessageBuilder carries its `text`/`html` inline in the capture
			// record (there is no raw body). When either exceeds the local capture
			// limit, truncate it for the store; delivery uses the full content.
			const capturedText =
				builder.text !== undefined
					? truncateStringForCapture(builder.text)
					: undefined;
			const capturedHtml =
				builder.html !== undefined
					? truncateStringForCapture(builder.html)
					: undefined;
			if (capturedText?.truncated || capturedHtml?.truncated) {
				await this.warnTruncated();
			}

			// Complete the workerd-side capture before resolving send()
			const evictedArtifacts = await this.reportSentEmail({
				worker: this.env.SEND_EMAIL_OWNER_WORKER,
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
				text: capturedText?.value,
				html: capturedHtml?.value,
				headers: builder.headers,
				attachments: sentAttachments,
			});

			this.ctx.waitUntil(
				(async () => {
					const files: string[] = [];

					if (builder.text) {
						const textPath = await this.storeTempFile(
							builder.text,
							"txt",
							"email-text",
							id,
							id
						);
						files.push(`Text: ${textPath}`);
					}

					if (builder.html) {
						const htmlPath = await this.storeTempFile(
							builder.html,
							"html",
							"email-html",
							id,
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
								`${id}-${index + 1}`,
								id
							);
							files.push(
								`Attachment (${attachment.disposition}): ${attachment.filename} -> ${attachmentPath}`
							);
						}
					}

					await this.removeSentArtifacts(evictedArtifacts);
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
