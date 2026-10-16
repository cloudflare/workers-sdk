/**
 * Type model for the email detail flow diagram and constants card.
 *
 * Simplified from Stratus's LogDetail types for the local explorer
 * email routing data model.
 */

import { formatMessageId } from "../../../utils/format";
import type {
	EmailAttachment,
	EmailHandlerEvent,
	EmailHandlerForward,
	EmailHandlerReply,
} from "../../../api";

const EMAIL_CAPTURE_ID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Returns whether an email route identifier is a generated capture UUID. */
export function isEmailCaptureId(id: string): boolean {
	return EMAIL_CAPTURE_ID_PATTERN.test(id);
}

/**
 * Derives the public identifier used in email detail URLs from an RFC
 * Message-ID. The server converts this bracket-stripped value into its local
 * storage ID.
 */
export function toEmailId(messageId: string): string {
	return formatMessageId(messageId);
}

export interface InfoEvent {
	/** Unique per-event key */
	id: string;
	/** The kind of event the handler produced */
	type: EmailHandlerEvent["type"];
	/** ISO 8601 timestamp of when the event occurred */
	timestamp: string;
	/** Payload for a `forward` event, correlated by messageId */
	forward?: EmailHandlerForward;
	/** Payload for a `reply` event, correlated by messageId */
	reply?: EmailHandlerReply;
	/** Reason for a `reject` event */
	rejectReason?: string;
}

export interface InfoRecipient {
	envelopeTos: string;
	events: InfoEvent[];
}

export interface InfoMessage {
	id: string;
	/** Envelope MAIL FROM address */
	from: string;
	/** Envelope RCPT TO address */
	to: string;
	subject: string;
	messageId?: string;
	/** ISO 8601 datetime */
	receivedAt: string;
	/** Size in bytes */
	rawSize: number;
	/** Attachment metadata; the content itself is only in the raw MIME */
	attachments: EmailAttachment[];
	recipients: InfoRecipient[];
}
