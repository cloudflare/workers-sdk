// Shared types for the local email store.
//
// Received ("routing") and sent ("sending") emails are captured at runtime and
// held in memory on the `Miniflare` instance. Workers push records over the
// loopback service, and the local explorer reads them back. Emails do not
// persist across dev-server restarts.

export type EmailRoutingActionType =
	| "received"
	| "unhandled"
	| "rejected"
	| "forwarded"
	| "replied";

export interface EmailRoutingAction {
	action: EmailRoutingActionType;
	timestamp: string;
	details?: Record<string, unknown>;
}

export interface StoredRoutingEmail {
	id: string;
	/** Worker whose `email()` handler processed the message, if known. */
	worker?: string;
	/** Envelope MAIL FROM address. */
	from: string;
	/** Envelope RCPT TO address. */
	to: string;
	subject: string;
	messageId?: string;
	receivedAt: string;
	rawSize: number;
	/** Raw MIME content (capped at 1MiB by the email handler). */
	raw: string;
	/** Ordered list of actions the handler took on the message. */
	handlingPath: EmailRoutingAction[];
}

export interface StoredSendingAttachment {
	filename: string;
	contentType: string;
	disposition: "inline" | "attachment";
	size: number;
}

export interface StoredSendingEmail {
	id: string;
	from: string;
	to: string[];
	cc?: string[];
	bcc?: string[];
	replyTo?: string;
	subject: string;
	sentAt: string;
	messageId?: string;
	text?: string;
	html?: string;
	headers?: Record<string, string>;
	attachments: StoredSendingAttachment[];
	/** Raw MIME content, present when sent via the `EmailMessage` API. */
	raw?: string;
}
