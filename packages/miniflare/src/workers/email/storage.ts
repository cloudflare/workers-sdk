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

import type {
	EmailAttachment,
	EmailHandlerForward,
	EmailHandlerReply,
	EmailHandlerResult,
	EmailRoutingDetail,
	EmailRoutingItem,
	EmailSendingDetail,
	EmailSendingItem,
} from "./contracts";

export type {
	EmailHandlerEvent,
	EmailHandlerForward,
	EmailHandlerReply,
	EmailHandlerResult,
} from "./contracts";

interface StoredCaptureMetadata {
	captureTruncated?: boolean;
}

type StoredEmailHandlerReply = EmailHandlerReply & StoredCaptureMetadata;

export type StoredRoutingEmail = Omit<
	EmailRoutingDetail,
	"forwards" | "replies"
> &
	Omit<EmailHandlerResult, "replies"> &
	StoredCaptureMetadata & {
		replies: StoredEmailHandlerReply[];
	};

export type StoredRoutingEmailMetadata = Omit<
	StoredRoutingEmail,
	"raw" | "rawBase64" | "replies"
> & {
	// Raw bodies are stored in separate rows, so the metadata record carries
	// only reply envelope fields.
	replies: Array<
		Omit<StoredRoutingEmail["replies"][number], "raw" | "rawBase64">
	>;
};

export type StoredRoutingEmailSummary = Omit<
	EmailRoutingItem,
	"forwards" | "replies"
> & {
	forwards: EmailHandlerForward[];
	replies: Array<Omit<EmailHandlerReply, "raw" | "rawBase64">>;
};

export type StoredEmailAttachment = EmailAttachment;

export type StoredSendingEmail = EmailSendingDetail & StoredCaptureMetadata;

export type StoredSendingEmailSummary = EmailSendingItem;

export interface EmailListPage<T> {
	items: T[];
	cursor?: string;
	hasMore: boolean;
}

/**
 * RPC surface of the email store host worker (see email-store.worker.ts). Used
 * to type the `SERVICE_EMAIL_STORE` service binding in the workers that
 * capture (send_email, the receiving `email()` path) and read (local explorer)
 * emails.
 */
export interface EmailStoreService {
	getSourceId(): Promise<string>;
	storeReceivedBody(
		captureId: string,
		part: number,
		rawBase64: string
	): Promise<void>;
	storeReceivedMetadata(
		captureId: string,
		expectedBodyParts: number,
		email: StoredRoutingEmailMetadata
	): Promise<void>;
	discardReceived(captureId: string): Promise<void>;
	/** Looks up a received email by local storage ID and optional worker. */
	findReceived(
		id: string,
		worker?: string
	): Promise<StoredRoutingEmail | undefined>;
	listReceived(
		cursor?: string,
		limit?: number,
		worker?: string
	): Promise<EmailListPage<StoredRoutingEmailSummary>>;
	storeSent(email: StoredSendingEmail): Promise<void>;
	/** Looks up a sent email by its local storage ID and optional worker. */
	findSent(
		id: string,
		worker?: string
	): Promise<StoredSendingEmail | undefined>;
	listSent(
		cursor?: string,
		limit?: number,
		worker?: string
	): Promise<EmailListPage<StoredSendingEmailSummary>>;
	clear(): Promise<void>;
}
