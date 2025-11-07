import { red } from "kleur/colors";
import PostalMime, { Email } from "postal-mime";

import { RAW_EMAIL } from "./constants";
import { type MiniflareEmailMessage as EmailMessage } from "./email.worker";

// Email Routing has some limits on what emails can be responded to, documented at https://developers.cloudflare.com/email-routing/email-workers/reply-email-workers/
export async function isEmailReplyable(
	email: Email,
	incomingEmailHeaders: Headers,
	log: (message: string) => Promise<void>
): Promise<boolean> {
	// The x-auto-response-supress header is set by MS Exchange and some other email services on outgoing email
	// to opt-out of automatic responses. If it's set, don't allow the user Worker to reply to the email
	const autoResponseSuppress = incomingEmailHeaders
		.get("x-auto-response-suppress")
		?.toLowerCase();
	if (autoResponseSuppress !== undefined && autoResponseSuppress !== "none") {
		return false;
	}

	// The auto-submitted header is set by some services to indicate that the email is auto generated
	// If it's set, don't allow the user Worker to reply to the email
	const autoSubmittedValue = incomingEmailHeaders
		.get("auto-submitted")
		?.toLowerCase();
	if (autoSubmittedValue !== undefined && autoSubmittedValue !== "no") {
		return false;
	}

	if (email.inReplyTo === undefined && email.references === undefined) {
		// If this email is _not_ part of an existing reply chain, it can be replied to
		return true;
	} else if (email.inReplyTo !== undefined && email.references !== undefined) {
		// If this email _is_ part of an existing reply chain, we need to validate the References header
		// according to https://datatracker.ietf.org/doc/html/rfc5322#section-3.6.4

		// Email Routing does not support more than 100 entries in the References header
		// Instead of parsing the References header according to https://datatracker.ietf.org/doc/html/rfc5322#section-3.6.4
		// we instead count the occurrences of the `@` symbol, which occurs once per email
		if ((email.references.match(/@/g)?.length ?? 0) >= 100) {
			await log(
				red(
					'The incoming email\'s "References" header has more than 100 entries. As such, your Worker cannot respond to this email. Refer to https://developers.cloudflare.com/email-routing/email-workers/reply-email-workers/.'
				)
			);
			return false;
		}

		return true;
	} else {
		// While this case (one of In-Reply-To or References being empty) is technically allowed by the RFC (https://datatracker.ietf.org/doc/html/rfc5322#section-3.6.4)
		// Email Routing does not support replying to emails with this format
		return false;
	}
}

/**
 * This will throw if there's anything wrong with the email (will try to send the same errors as we do in production).
 * It will also add the `References` header if it's not on the reply email.
 * @param email email reply
 * @returns Actual email to be used to reply (with all correct headers)
 */
export async function validateReply(
	incomingMessage: Email,
	replyMessage: EmailMessage
): Promise<Uint8Array> {
	const rawEmail: ReadableStream<Uint8Array> = replyMessage[RAW_EMAIL];

	const rawEmailBuffer = new Uint8Array(
		await new Response(rawEmail).arrayBuffer()
	);

	let parsedReply: Email;
	try {
		parsedReply = await PostalMime.parse(rawEmailBuffer);
	} catch (e) {
		const error = e as Error;
		throw new Error(`could not parse email: ${error.message}`);
	}

	if (parsedReply.from?.address !== replyMessage.from) {
		throw new Error("From: header does not match mail from");
	}

	if (parsedReply.messageId === undefined) {
		throw new Error("invalid message-id");
	}

	const replyEmailHeaders = new Headers(
		parsedReply.headers.map((header) => [header.key, header.value])
	);

	// Replies from an Email Worker cannot change the Received header
	if (replyEmailHeaders.get("received") !== null) {
		throw new Error("invalid headers set");
	}

	if (parsedReply.inReplyTo === undefined) {
		throw new Error("no In-Reply-To header found in reply message");
	}

	if (parsedReply.inReplyTo !== incomingMessage.messageId) {
		throw new Error("In-Reply-To does not match original Message-ID");
	}

	const incomingReferences = incomingMessage.references ?? "";

	if (parsedReply.references !== undefined) {
		// if the email has the References header, we just validate it matches the incoming References header and also includes the incoming message ID
		// Refer to https://datatracker.ietf.org/doc/html/rfc5322#section-3.6.4
		if (
			!(
				parsedReply.references.includes(incomingMessage.messageId) &&
				parsedReply.references.includes(incomingReferences)
			)
		) {
			throw new Error("provided References header is invalid");
		}
	} else {
		// Otherwise, we need to construct a new References header according to https://datatracker.ietf.org/doc/html/rfc5322#section-3.6.4
		const replyReferences = `References: ${incomingMessage.messageId}${incomingReferences.length > 0 ? " " : ""}${incomingReferences}\r\n`;

		const encodedReferences = new TextEncoder().encode(replyReferences);

		const finalReplyEmail = new Uint8Array(
			encodedReferences.byteLength + rawEmailBuffer.byteLength
		);

		// prepend References to be in the headers instead of the end of the body
		finalReplyEmail.set(encodedReferences, 0);
		finalReplyEmail.set(rawEmailBuffer, encodedReferences.byteLength);
		return finalReplyEmail;
	}

	return rawEmailBuffer;
}
