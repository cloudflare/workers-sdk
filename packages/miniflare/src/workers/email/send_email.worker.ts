import { WorkerEntrypoint } from "cloudflare:workers";
import { blue } from "kleur/colors";
import PostalMime from "postal-mime";
import { RAW_EMAIL } from "./constants";
import { type MiniflareEmailMessage as EmailMessage } from "./email.worker";
import type { EmailAddress, MessageBuilder } from "./types";
import type { Email } from "postal-mime";

/**
 * Build a Message-ID in the shape the production `send_email` binding returns:
 * `<{36 alphanumeric chars}@{sender domain}>`, brackets included. The body is
 * random — production synthesizes its own id rather than echoing any header
 * present in the submitted email.
 */
function synthesizeMessageId(senderEmail: string): string {
	const alphabet =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	const bytes = crypto.getRandomValues(new Uint8Array(36));
	const id = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
	const domain = senderEmail.slice(senderEmail.lastIndexOf("@") + 1);
	return `<${id}@${domain}>`;
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

/**
 * Appends path segments to a base path using the separator already implied by
 * the base path string. This trims trailing `/` and `\` from the base before
 * joining, but does not otherwise normalize the full path.
 */
function joinPath(base: string, ...segments: string[]): string {
	const separator = base.includes("\\") ? "\\" : "/";
	return [base.replace(/[\\/]+$/, ""), ...segments].join(separator);
}

interface DiskServiceConfig {
	location: "system" | "project";
	bindingName: string;
	serviceName: string;
	path: string;
}

interface SendEmailEnv {
	email_disk_services: DiskServiceConfig[];
	destination_address: string | undefined;
	allowed_destination_addresses: string[] | undefined;
	allowed_sender_addresses: string[] | undefined;
	MINIFLARE_EMAIL_DISK_SYSTEM: Fetcher;
	MINIFLARE_EMAIL_DISK_PROJECT?: Fetcher;
}

export class SendEmailBinding extends WorkerEntrypoint<SendEmailEnv> {
	/**
	 * Gets a disk service binding by name
	 */
	private getServiceBinding(bindingName: string): Fetcher {
		const binding = this.env[
			bindingName as
				| "MINIFLARE_EMAIL_DISK_SYSTEM"
				| "MINIFLARE_EMAIL_DISK_PROJECT"
		];
		if (!binding) {
			throw new Error(`Disk service binding not found: ${bindingName}`);
		}
		return binding;
	}

	/**
	 * Logs a message via the runtime console.
	 */
	private log(message: string): void {
		console.log(message);
	}
	/**
	 * Stores content to a temporary file via the disk service.
	 */
	private async storeTempFile(
		content: string | ArrayBuffer | ArrayBufferView,
		extension: string,
		prefix: string,
		location: "system" | "project" = "system",
		messageUUID?: string
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

		const fileName = messageUUID
			? `${messageUUID}.${extension}`
			: `${crypto.randomUUID()}.${extension}`;
		const url = new URL(`${prefix}/${fileName}`, "http://placeholder/");

		// Find the disk service config for the requested location.
		const diskConfig = this.env.email_disk_services.find(
			(config) => config.location === location
		);

		if (!diskConfig) {
			throw new Error(`Disk service for ${location} not found`);
		}

		const service = this.getServiceBinding(diskConfig.bindingName);
		await service.fetch(url, {
			method: "PUT",
			body,
		});

		return joinPath(diskConfig.path, prefix, fileName);
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
		const messageUUID: string = crypto.randomUUID();
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

			const locations = this.env.email_disk_services.map(
				(service) => service.location
			);
			const filePaths = await Promise.all(
				locations.map((location) =>
					this.storeTempFile(
						rawEmailBuffer,
						"eml",
						"email",
						location,
						messageUUID
					)
				)
			);

			// Log only project location if it exists, otherwise system location
			const projectIndex = locations.indexOf("project");
			const logIndex = projectIndex !== -1 ? projectIndex : 0;
			const fileInfo = `Email (${locations[logIndex]}): ${filePaths[logIndex]}`;
			this.log(
				`${blue("send_email binding called with the following message:")}\n${fileInfo}`
			);

			return { messageId: synthesizeMessageId(emailMessage.from) };
		} else {
			// New MessageBuilder API - just validate and log
			const builder = emailMessageOrBuilder;

			// Validate the message builder
			this.validateMessageBuilder(builder);

			// Store text, HTML content, and attachments to files for easy viewing
			const locations = this.env.email_disk_services.map(
				(service) => service.location
			);
			const files: string[] = [];

			if (builder.text) {
				const text = builder.text;
				const textResults = await Promise.all(
					locations.map((location) =>
						this.storeTempFile(text, "txt", "email-text", location, messageUUID)
					)
				);
				// Log only project location if it exists, otherwise system location
				const projectIndex = locations.indexOf("project");
				const logIndex = projectIndex !== -1 ? projectIndex : 0;
				files.push(`Text (${locations[logIndex]}): ${textResults[logIndex]}`);
			}

			if (builder.html) {
				const html = builder.html;
				const htmlResults = await Promise.all(
					locations.map((location) =>
						this.storeTempFile(
							html,
							"html",
							"email-html",
							location,
							messageUUID
						)
					)
				);
				// Log only project location if it exists, otherwise system location
				const projectIndex = locations.indexOf("project");
				const logIndex = projectIndex !== -1 ? projectIndex : 0;
				files.push(`HTML (${locations[logIndex]}): ${htmlResults[logIndex]}`);
			}

			// Store attachments
			if (builder.attachments) {
				for (const attachment of builder.attachments) {
					// Extract file extension from filename or use generic extension
					const extMatch = attachment.filename.match(/\.([^.]+)$/);
					const extension = extMatch ? extMatch[1] : "bin";
					const attachmentUUID = crypto.randomUUID();

					const attachmentResults = await Promise.all(
						locations.map((location) =>
							this.storeTempFile(
								attachment.content,
								extension,
								"email-attachment",
								location,
								attachmentUUID
							)
						)
					);
					// Log only project location if it exists, otherwise system location
					const projectIndex = locations.indexOf("project");
					const logIndex = projectIndex !== -1 ? projectIndex : 0;
					files.push(
						`Attachment (${attachment.disposition}) (${locations[logIndex]}): ${attachment.filename} -> ${attachmentResults[logIndex]}`
					);
				}
			}

			// Format and log the message details with file paths
			const formatted = formatMessageBuilder(builder);
			const fileInfo = files.length > 0 ? `\n\n${files.join("\n")}` : "";
			this.log(
				`${blue("send_email binding called with MessageBuilder:")}\n${formatted}${fileInfo}`
			);

			return {
				messageId: synthesizeMessageId(extractEmailAddress(builder.from)),
			};
		}
	}
}
