// Shared types for the local email store.
//
// Received ("routing") and sent ("sending") emails are captured at runtime and
// held in memory on the `Miniflare` instance. Workers push records over the
// loopback service, and the local explorer reads them back. Emails do not
// persist across dev-server restarts.

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
	/** Attachments parsed out of `raw`. Metadata only.*/
	attachments: StoredEmailAttachment[];
}

export interface StoredEmailAttachment {
	filename: string;
	contentType: string;
	disposition: "inline" | "attachment";
	size: number;
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
}

/**
 * RPC surface of the email store host worker (see email-store.worker.ts). Used
 * to type the `SERVICE_EMAIL_STORE` service binding in the workers that
 * capture (send_email, the receiving `email()` path) and read (local explorer)
 * emails.
 */
export interface EmailStoreService {
	storeReceived(email: StoredRoutingEmail): Promise<void>;
	/** Looks up a received email by its bracket-stripped Message-ID. */
	findReceived(id: string): Promise<StoredRoutingEmail | undefined>;
	listReceived(): Promise<StoredRoutingEmail[]>;
	storeSent(email: StoredSendingEmail): Promise<void>;
	/** Looks up a sent email by its bracket-stripped Message-ID. */
	findSent(id: string): Promise<StoredSendingEmail | undefined>;
	listSent(): Promise<StoredSendingEmail[]>;
	clear(): Promise<void>;
}
