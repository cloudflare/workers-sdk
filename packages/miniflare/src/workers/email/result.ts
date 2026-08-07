// The result of dispatching an email to a Worker's `email()` handler, as
// returned by `/cdn-cgi/local/email?format=json` and captured for the local
// explorer's "Routing" view.
//
// A single event model describes everything the handler did to a message:
// `events` is the ordered lifecycle, and `forwards`/`replies` carry the full
// payload for each `forward`/`reply` event (correlated by `messageId`). This
// lets consumers render a timeline while still having the details on hand.

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
