import { blue } from "kleur/colors";
import PostalMime, { Email } from "postal-mime";
import { RAW_EMAIL } from "./constants";
import { type MiniflareEmailMessage as EmailMessage } from "./email.worker";

/**
 * @param input Header value for Message-Id, References, In-Reply-To, and other header values that might contain Message-id style text.
 */
export function parseMessageIdStyleValue(input: string): string[] | undefined {
	// probably not quite RFC-2822 compliant because we don't explicitly support comments,
	// but no one uses them anyway.

	type States = "inside" | "outside";

	const allowedOutsideChars = [" ", "\r", "\t", "\n"];

	let parserState: States = "outside"; // there might be spaces like chars in the value

	const output: string[] = [];
	let buffer: string = "";
	for (const char of input) {
		if (parserState === "outside" && allowedOutsideChars.includes(char)) {
			continue;
		}

		if (parserState === "outside" && char === "<") {
			parserState = "inside";
			continue;
		}

		if (parserState === "inside" && char === ">") {
			parserState = "outside";
			if (buffer.length === 0) {
				return undefined;
			}
			output.push(buffer);
			buffer = ""; // reset buffer
			continue;
		}

		if (parserState === "inside") {
			buffer += char;
			continue;
		}

		// if we ever reach here, means that there was some invalid input and we return undefined
		return undefined;
	}

	return output;
}

export function isEmailReplyable(
	email: Email,
	incomingEmailHeaders: Headers
): boolean {
	// if we get a x-auto-response-supress and its anything but none, we make it as
	// not repliable.
	const autoResponseSupress = incomingEmailHeaders
		.get("x-auto-response-supress")
		?.toLowerCase();
	if (autoResponseSupress !== undefined && autoResponseSupress !== "none") {
		return false;
	}

	// if we get a auto-submited and its anything but no, we make it as not repliable
	// as it's not organic email.
	const autoSubmitedValue = incomingEmailHeaders
		.get("auto-submitted")
		?.toLowerCase();
	if (autoSubmitedValue !== undefined && autoSubmitedValue !== "no") {
		return false;
	}

	if (email.inReplyTo === undefined && email.references === undefined) {
		return true;
	}

	if (email.inReplyTo !== undefined && email.references !== undefined) {
		const parsedReferences = parseMessageIdStyleValue(email.references);
		if (parsedReferences === undefined) {
			console.log(
				"Failed to parse incoming email's References header. Assuming email as non-repliable"
			);
			return false;
		}
		if (parsedReferences.length >= 100) {
			console.log(
				`${blue("Email might not be repliable in production due to the `References` size.")} See https://developers.cloudflare.com/email-routing/email-workers/reply-email-workers/`
			);
		}

		return true;
	}

	return false;
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

	if (parsedReply.from.address !== replyMessage.from) {
		throw new Error("From: header does not match mail from");
	}

	if (parsedReply.messageId === undefined) {
		throw new Error("invalid message-id");
	}

	let replyEmailHeaders: Headers;
	try {
		replyEmailHeaders = new Headers(
			parsedReply.headers.map((header) => [header.key, header.value])
		);
	} catch (e) {
		const error = e as Error;
		throw new Error(`could not parse email: ${error.message}`);
	}

	// reply cannot mess with the Received header
	if (replyEmailHeaders.get("received") !== null) {
		throw new Error("invalid headers set");
	}

	if (parsedReply.inReplyTo === undefined) {
		throw new Error("no In-Reply-To header found in reply message");
	}

	if (parsedReply.inReplyTo !== incomingMessage.messageId) {
		throw new Error("In-Reply-To does not match original Message-ID");
	}

	const expectedReferences =
		incomingMessage.references !== undefined
			? parseMessageIdStyleValue(incomingMessage.references)
			: [];
	const parsedIncomingMessageId = parseMessageIdStyleValue(
		incomingMessage.messageId
	)?.[0];
	// I expect the incoming email validator to catch this
	if (
		expectedReferences === undefined ||
		parsedIncomingMessageId === undefined
	) {
		console.error(
			"Failed to get the References or Message-Id header from the incoming email. This is unexpected as it passed through validation first."
		);
		throw new Error("internal error");
	}

	expectedReferences.push(parsedIncomingMessageId);

	// if the email has the references header, we just validate them.
	if (parsedReply.references !== undefined) {
		const parsedReferences = parseMessageIdStyleValue(parsedReply.references);

		if (
			parsedReferences === undefined ||
			parsedReferences.every((val, index) => val === expectedReferences[index])
		) {
			throw new Error("provided References header is invalid");
		}
	} else {
		const replyReferences = `References: ${expectedReferences.reduce((prev, curr) => prev + `\r\n <${curr}>`, "")}\r\n`;

		// FIXME(lduarte): this converts to UTF-8 and not ASCII, which might lead to unexpected mismatches to production
		// since SMTPUTF8 is not always a thing
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
