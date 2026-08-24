import { z } from "zod";

export type EmailHandlerEvent =
	| {
			type: "received" | "reject" | "unhandled";
			timestamp: string;
	  }
	| {
			type: "forward" | "reply";
			timestamp: string;
			messageId: string;
	  };

export const zEmailHandlerEvent = z
	.discriminatedUnion("type", [
		z.object({
			type: z.enum(["received", "reject", "unhandled"]),
			timestamp: z
				.string()
				.describe("ISO 8601 timestamp of when the event occurred."),
		}),
		z.object({
			type: z.enum(["forward", "reply"]),
			timestamp: z
				.string()
				.describe("ISO 8601 timestamp of when the event occurred."),
			messageId: z
				.string()
				.describe("Correlates with the matching `forwards`/`replies` entry."),
		}),
	])
	.describe(
		"One entry in the ordered lifecycle of what the handler did to the message. `received` is first for any message actually delivered to an `email()` handler. The exception is `unhandled`: when the Worker exports no `email()` handler the message never reaches one, so the timeline is a single `unhandled` event with no preceding `received`. `forward`/`reply` events carry a `messageId` correlating with the matching `forwards`/`replies` entry."
	) satisfies z.ZodType<EmailHandlerEvent>;

export interface EmailHandlerForward {
	messageId: string;
	recipient: string;
	headers: [string, string][];
}

export const zEmailHandlerForward = z.object({
	messageId: z.string(),
	recipient: z
		.string()
		.describe("Envelope recipient the message was forwarded to."),
	headers: z
		.array(z.tuple([z.string(), z.string()]))
		.describe("Headers added to the forwarded message."),
}) satisfies z.ZodType<EmailHandlerForward>;

const zEmailHandlerReplyBase = z.object({
	messageId: z.string(),
	sender: z.string().describe("Address the reply was sent from."),
});

export const zEmailHandlerReplyApi = zEmailHandlerReplyBase.extend({
	raw: z
		.string()
		.describe(
			"Raw MIME content of the reply. Omitted from the routing list; present on the detail response."
		)
		.optional(),
	rawBase64: z
		.string()
		.describe("Lossless base64 representation of the reply MIME.")
		.optional(),
});

export const zEmailHandlerReply = zEmailHandlerReplyBase.extend({
	raw: z.string().describe("Raw MIME content of the reply."),
	rawBase64: z
		.string()
		.describe("Lossless base64 representation of the reply MIME.")
		.optional(),
});

export interface EmailHandlerReply {
	messageId: string;
	sender: string;
	raw: string;
	rawBase64?: string;
}

export interface EmailHandlerResult {
	outcome: "ok" | "exception";
	rejectReason?: string;
	forwards: EmailHandlerForward[];
	replies: EmailHandlerReply[];
	events: EmailHandlerEvent[];
}

export const zEmailHandlerResult = z.object({
	outcome: z.enum(["ok", "exception"]),
	rejectReason: z
		.string()
		.describe(
			"Reason passed to `setReject()`, if the handler rejected the message."
		)
		.optional(),
	forwards: z.array(zEmailHandlerForward),
	replies: z.array(zEmailHandlerReply),
	events: z
		.array(zEmailHandlerEvent)
		.describe(
			"Ordered lifecycle of everything the handler did to the message."
		),
}) satisfies z.ZodType<EmailHandlerResult>;

export const zEmailAttachment = z
	.object({
		filename: z.string(),
		contentType: z.string(),
		disposition: z.enum(["inline", "attachment"]),
		size: z.number(),
	})
	.describe(
		"Metadata describing an attachment on a captured email, without its content."
	);

export type EmailAttachment = z.infer<typeof zEmailAttachment>;

export const zEmailBase = z.object({
	worker: z
		.string()
		.describe("Worker associated with the email, if known.")
		.optional(),
	from: z.string().describe("Envelope MAIL FROM address."),
	subject: z.string(),
	messageId: z
		.string()
		.describe(
			"RFC Message-ID header value. Identifies the email in the store."
		),
	attachments: z
		.array(zEmailAttachment)
		.describe(
			"Metadata for attachments parsed out of the email. The content itself is only available in the raw MIME."
		),
});

export const zEmailRoutingItem = zEmailBase.extend({
	to: z.string().describe("Envelope RCPT TO address."),
	cc: z.array(z.string()).optional(),
	headers: z.record(z.string(), z.string()).optional(),
	receivedAt: z.string(),
	rawSize: z.number(),
	outcome: z
		.enum(["ok", "exception"])
		.describe("Whether the handler ran to completion or threw."),
	rejectReason: z
		.string()
		.describe(
			"Reason passed to setReject(), if the handler rejected the message."
		)
		.optional(),
	forwards: z.array(zEmailHandlerForward),
	replies: z.array(zEmailHandlerReplyApi),
	events: z.array(zEmailHandlerEvent),
});

export type EmailRoutingItem = z.infer<typeof zEmailRoutingItem>;

export const zEmailRoutingDetail = zEmailRoutingItem.extend({
	raw: z.string().describe("Raw MIME content of the received email."),
	rawBase64: z
		.string()
		.describe("Lossless base64 representation of the received MIME.")
		.optional(),
});

export type EmailRoutingDetail = z.infer<typeof zEmailRoutingDetail>;

const zEmailSendAttachment = z.object({
	filename: z.string().describe("Name the attachment is presented under."),
	type: z
		.string()
		.describe("MIME type of the attachment, e.g. 'application/pdf'."),
	content: z
		.string()
		.describe(
			"Attachment content, base64-encoded. MessageBuilder takes raw bytes here, but this endpoint accepts JSON so the bytes must be base64-encoded."
		),
	contentId: z
		.string()
		.describe("Content-ID for an inline attachment.")
		.optional(),
	disposition: z
		.enum(["inline", "attachment"])
		.describe("How the attachment is presented. Defaults to 'attachment'.")
		.optional(),
});

export const zEmailSendRequest = z
	.object({
		from: z.string().describe("Sender address."),
		to: z.array(z.string()).min(1).describe("Recipient addresses."),
		cc: z.array(z.string()).optional(),
		bcc: z.array(z.string()).optional(),
		replyTo: z.string().optional(),
		subject: z.string(),
		text: z.string().describe("Plain text body.").optional(),
		html: z.string().describe("HTML body.").optional(),
		headers: z
			.record(z.string(), z.string())
			.describe("Custom headers to include on the message.")
			.optional(),
		attachments: z
			.array(zEmailSendAttachment)
			.describe(
				"Attachments to include on the message, mirroring the MessageBuilder `attachments` entries accepted by a send_email binding. Adding any attachment composes the message as multipart/mixed."
			)
			.optional(),
	})
	.describe("Fields for composing a test email, mirroring MessageBuilder.");

export type EmailSendRequest = z.infer<typeof zEmailSendRequest>;

export const zEmailSendingItem = zEmailBase.extend({
	to: z.array(z.string()),
	cc: z.array(z.string()).optional(),
	bcc: z.array(z.string()).optional(),
	replyTo: z.string().optional(),
	sentAt: z.string(),
	headers: z.record(z.string(), z.string()).optional(),
});

export type EmailSendingItem = z.infer<typeof zEmailSendingItem>;

export const zEmailSendingDetail = zEmailSendingItem.extend({
	text: z.string().optional(),
	html: z.string().optional(),
	raw: z
		.string()
		.describe("Raw MIME content, present when sent via the EmailMessage API.")
		.optional(),
	rawBase64: z
		.string()
		.describe("Lossless base64 representation of sent MIME.")
		.optional(),
});

export type EmailSendingDetail = z.infer<typeof zEmailSendingDetail>;
