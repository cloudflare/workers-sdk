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

import { z } from "zod";
import {
	zEmailHeaders,
	zEmailHandlerEvent,
	zEmailHandlerForward,
	zEmailHandlerReplyApi,
} from "./contracts";

export type {
	EmailHandlerEvent,
	EmailHandlerForward,
	EmailHandlerReply,
	EmailHandlerResult,
} from "./contracts";

const zStoredEmailReply = zEmailHandlerReplyApi.omit({
	raw: true,
	rawBase64: true,
});
const zStoredEmailReplyMetadata = zStoredEmailReply.extend({
	captureTruncated: z.boolean().optional(),
});
const zStoredEmailAttachment = z.object({
	filename: z.string(),
	contentType: z.string(),
	disposition: z.enum(["inline", "attachment"]),
	size: z.number(),
});
const zStoredEmailBase = z.object({
	worker: z.string().optional(),
	from: z.string(),
	subject: z.string(),
	messageId: z.string(),
	attachments: z.array(zStoredEmailAttachment),
});
export const zStoredRoutingEmailSummary = zStoredEmailBase.extend({
	to: z.string(),
	cc: z.array(z.string()).optional(),
	headers: z.record(z.string(), z.string()).optional(),
	headerEntries: zEmailHeaders.optional(),
	receivedAt: z.string(),
	rawSize: z.number(),
	outcome: z.enum(["ok", "exception"]),
	rejectReason: z.string().optional(),
	forwards: z.array(zEmailHandlerForward),
	replies: z.array(zStoredEmailReply),
	events: z.array(zEmailHandlerEvent),
});
export const zStoredRoutingEmailMetadata = zStoredRoutingEmailSummary.extend({
	captureTruncated: z.boolean().optional(),
	replies: z.array(zStoredEmailReplyMetadata),
});
export const zStoredRoutingEmail = zStoredRoutingEmailMetadata.extend({
	raw: z.string(),
	rawBase64: z.string(),
	replies: z.array(
		zEmailHandlerReplyApi.extend({
			raw: z.string(),
			rawBase64: z.string(),
			captureTruncated: z.boolean().optional(),
		})
	),
});
export const zStoredSendingEmailSummary = zStoredEmailBase.extend({
	to: z.array(z.string()),
	cc: z.array(z.string()).optional(),
	bcc: z.array(z.string()).optional(),
	replyTo: z.string().optional(),
	sentAt: z.string(),
	headers: z.record(z.string(), z.string()).optional(),
});
export const zStoredSendingEmail = zStoredSendingEmailSummary.extend({
	text: z.string().optional(),
	html: z.string().optional(),
	raw: z.string().optional(),
	rawBase64: z.string().optional(),
	captureTruncated: z.boolean().optional(),
});

export type StoredEmailAttachment = z.infer<typeof zStoredEmailAttachment>;
export type StoredRoutingEmailSummary = z.infer<
	typeof zStoredRoutingEmailSummary
>;
export type StoredRoutingEmailMetadata = z.infer<
	typeof zStoredRoutingEmailMetadata
>;
export type StoredRoutingEmail = z.infer<typeof zStoredRoutingEmail>;
export type StoredSendingEmailSummary = z.infer<
	typeof zStoredSendingEmailSummary
>;
export type StoredSendingEmail = z.infer<typeof zStoredSendingEmail>;

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
