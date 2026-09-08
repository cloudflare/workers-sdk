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

export const zEmailHeaders = z
	.array(z.tuple([z.string(), z.string()]))
	.describe("Email headers as ordered name/value pairs, including duplicates.");

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
