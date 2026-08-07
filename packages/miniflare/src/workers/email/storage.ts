// Shared types for the local email store.
//
// Received ("routing") and sent ("sending") emails are captured at runtime and
// held in the instance-local email-store Durable Object. Workers push records
// over workerd-internal RPC, and the local explorer reads them back. Emails do
// not persist across dev-server restarts.
//
// This module also defines the shape of an `email()` handler's result (the
// `EmailHandler*` types), as returned by `/cdn-cgi/local/email?format=json` and
// captured for the local explorer's "Routing" view. A single event model
// describes everything the handler did to a message: `events` is the ordered
// lifecycle, and `forwards`/`replies` carry the full payload for each
// `forward`/`reply` event (correlated by `messageId`). This lets consumers
// render a timeline while still having the details on hand.

export type EmailHandlerEventType =
	| "received"
	| "forward"
	| "reply"
	| "reject"
	| "unhandled";

export type EmailHandlerEvent =
	| {
			/** A message the handler forwarded or replied to. */
			type: "forward" | "reply";
			timestamp: string;
			/** Correlates with the matching `forwards`/`replies` entry. */
			messageId: string;
	  }
	| {
			/**
			 * A lifecycle event with no associated message: `received` (always
			 * first), `reject` (the handler called `setReject()`), or `unhandled`
			 * (the Worker exports no `email()` handler).
			 */
			type: "received" | "reject" | "unhandled";
			timestamp: string;
	  };

export interface EmailHandlerForward {
	messageId: string;
	/** Envelope recipient the message was forwarded to. */
	recipient: string;
	headers: [string, string][];
}

export interface EmailHandlerReply {
	messageId: string;
	/** Address the reply was sent from. */
	sender: string;
	/** Raw MIME content of the reply. */
	raw: string;
	/** Lossless base64 representation of the reply MIME. */
	rawBase64?: string;
}

export interface EmailHandlerResult {
	outcome: "ok" | "exception";
	/** Reason passed to `setReject()`, if the handler rejected the message. */
	rejectReason?: string;
	forwards: EmailHandlerForward[];
	replies: EmailHandlerReply[];
	/** Ordered lifecycle of everything the handler did to the message. */
	events: EmailHandlerEvent[];
}

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

export type StoredRoutingEmailMetadata = Omit<
	StoredRoutingEmail,
	"raw" | "rawBase64" | "replies"
> & {
	// Reply raw bodies are streamed separately (see the received chunk
	// transport), so the metadata prelude carries only reply envelope fields.
	replies: Array<
		Omit<StoredRoutingEmail["replies"][number], "raw" | "rawBase64">
	>;
};

export type StoredRoutingEmailRecord = Omit<
	StoredRoutingEmail,
	"raw" | "rawBase64" | "replies"
> & {
	rawBase64: string;
	// Reply raw bodies are stored base64-only; the decoded `raw` is
	// materialised on read.
	replies: Array<
		Omit<StoredRoutingEmail["replies"][number], "raw" | "rawBase64"> & {
			raw?: string;
			rawBase64?: string;
		}
	>;
};

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
	/** Worker that owns the `send_email` binding the message was sent through, if known. */
	worker?: string;
	from: string;
	to: string[];
	cc?: string[];
	bcc?: string[];
	replyTo?: string;
	subject: string;
	sentAt: string;
	/**
	 * RFC `Message-ID` header value (`<id@domain>`). Indexes the record in the
	 * store.
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
 * A sent email without its raw MIME body, used as the metadata prelude when
 * streaming a large raw email's body to the store in chunks (mirrors
 * `StoredRoutingEmailMetadata`).
 */
export type StoredSendingEmailMetadata = Omit<
	StoredSendingEmail,
	"raw" | "rawBase64"
>;

/**
 * RPC surface of the email store host worker (see email-store.worker.ts). Used
 * to type the `SERVICE_EMAIL_STORE` service binding in the workers that
 * capture (send_email, the receiving `email()` path) and read (local explorer)
 * emails.
 */
export interface EmailStoreService {
	storeReceived(email: StoredRoutingEmailRecord): Promise<EmailArtifact[]>;
	beginReceived(email: StoredRoutingEmailMetadata): Promise<void>;
	appendReceivedRaw(id: string, chunk: string): Promise<void>;
	appendReplyRaw(id: string, replyIndex: number, chunk: string): Promise<void>;
	finishReceived(id: string): Promise<EmailArtifact[]>;
	discardReceived(id: string): Promise<void>;
	/** Looks up a received email by its local storage ID. */
	findReceived(id: string): Promise<StoredRoutingEmail | undefined>;
	listReceived(): Promise<StoredRoutingEmailSummary[]>;
	storeSent(email: StoredSendingEmail): Promise<EmailArtifact[]>;
	beginSent(email: StoredSendingEmailMetadata): Promise<void>;
	appendSentRaw(id: string, chunk: string): Promise<void>;
	finishSent(id: string): Promise<EmailArtifact[]>;
	discardSent(id: string): Promise<void>;
	/** Looks up a sent email by its local storage ID. */
	findSent(id: string): Promise<StoredSendingEmail | undefined>;
	listSent(): Promise<StoredSendingEmailSummary[]>;
	clear(): Promise<void>;
}
