// Shared types for the local email store.
//
// Received ("routing") and sent ("sending") emails are captured at runtime and
// held in the instance-local email-store Durable Object. Workers push records
// over workerd-internal RPC, and the local explorer reads them back. Emails do
// not persist across dev-server restarts.

import type { EmailHandlerResult } from "./result";

export interface StoredRoutingEmail extends EmailHandlerResult {
	/** Worker whose `email()` handler processed the message, if known. */
	worker?: string;
	/** Envelope MAIL FROM address. */
	from: string;
	/** Envelope RCPT TO address. */
	to: string;
	subject: string;
	/**
	 * RFC `Message-ID` header value (`<id@domain>`). Indexes the record in the
	 * store; a message listed in the explorer is looked up by it.
	 */
	messageId: string;
	receivedAt: string;
	rawSize: number;
	/** Raw MIME content (capped at 1MiB by the email handler). */
	raw: string;
	/** Lossless base64 representation of the raw MIME content. */
	rawBase64?: string;
	/** Attachments parsed out of `raw`. Metadata only.*/
	attachments: StoredEmailAttachment[];
}

export type StoredRoutingEmailSummary = Omit<
	StoredRoutingEmail,
	"raw" | "rawBase64" | "replies"
> & {
	replies: Array<
		Omit<StoredRoutingEmail["replies"][number], "raw" | "rawBase64">
	>;
};

export interface StoredEmailAttachment {
	filename: string;
	contentType: string;
	disposition: "inline" | "attachment";
	size: number;
}

export interface EmailArtifact {
	recordId: string;
	prefix: string;
	id: string;
	extension: string;
}

export interface StoredSendingEmail {
	from: string;
	to: string[];
	cc?: string[];
	bcc?: string[];
	replyTo?: string;
	subject: string;
	sentAt: string;
	/**
	 * RFC `Message-ID` header value (`<id@domain>`). Indexes the record in the
	 * store; a message listed in the explorer is looked up by it.
	 */
	messageId: string;
	text?: string;
	html?: string;
	headers?: Record<string, string>;
	attachments: StoredEmailAttachment[];
	/** Raw MIME content, present when sent via the `EmailMessage` API. */
	raw?: string;
	/** Lossless base64 representation of the raw MIME content. */
	rawBase64?: string;
}

export type StoredSendingEmailSummary = Omit<
	StoredSendingEmail,
	"text" | "html" | "raw" | "rawBase64"
>;

/**
 * RPC surface of the email store host worker (see email-store.worker.ts). Used
 * to type the `SERVICE_EMAIL_STORE` service binding in the workers that
 * capture (send_email, the receiving `email()` path) and read (local explorer)
 * emails.
 */
export interface EmailStoreService {
	storeReceived(email: StoredRoutingEmail): Promise<EmailArtifact[]>;
	/** Looks up a received email by its bracket-stripped Message-ID. */
	findReceived(id: string): Promise<StoredRoutingEmail | undefined>;
	listReceived(): Promise<StoredRoutingEmailSummary[]>;
	storeSent(email: StoredSendingEmail): Promise<EmailArtifact[]>;
	/** Looks up a sent email by its bracket-stripped Message-ID. */
	findSent(id: string): Promise<StoredSendingEmail | undefined>;
	listSent(): Promise<StoredSendingEmailSummary[]>;
	clear(): Promise<void>;
}
