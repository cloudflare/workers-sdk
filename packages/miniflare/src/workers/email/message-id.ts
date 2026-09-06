// Message-ID handling shared by the paths that capture emails: the `send_email`
// binding and the local explorer's "send test email" endpoint. Both must agree
// on the format, because the id derived from a Message-ID keys the explorer's
// record.

const ID_ALPHABET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Builds a Message-ID in the shape the production `send_email` binding returns:
 * `<{36 base-62 characters}@{sender domain}>`.
 */
export function synthesizeMessageId(senderEmail: string): string {
	const bytes = crypto.getRandomValues(new Uint8Array(36));
	const id = Array.from(
		bytes,
		(byte) => ID_ALPHABET[byte % ID_ALPHABET.length]
	).join("");
	const domain = senderEmail.slice(senderEmail.lastIndexOf("@") + 1);
	return `<${id}@${domain}>`;
}

/**
 * Sets the top-level Message-ID header without decoding or rewriting the MIME
 * body. Existing folded or duplicate Message-ID headers are replaced by one
 * normalized header.
 */
export function setMessageIdHeader(
	rawEmail: Uint8Array,
	messageId: string
): Uint8Array {
	const crlfSeparator = new Uint8Array([13, 10, 13, 10]);
	const lfSeparator = new Uint8Array([10, 10]);
	const crlfHeaderEnd = findSequence(rawEmail, crlfSeparator);
	const lfHeaderEnd = findSequence(rawEmail, lfSeparator);
	const usesCrlf =
		crlfHeaderEnd !== -1 &&
		(lfHeaderEnd === -1 || crlfHeaderEnd <= lfHeaderEnd);
	const headerEnd = usesCrlf ? crlfHeaderEnd : lfHeaderEnd;
	if (headerEnd === -1) {
		throw new Error("could not find end of email headers");
	}

	const lineEnding = usesCrlf ? "\r\n" : "\n";
	const header = new TextDecoder().decode(rawEmail.subarray(0, headerEnd));
	const lines = header.split(/\r?\n/u);
	const normalizedLines: string[] = [];
	let foundMessageId = false;
	let skippingContinuation = false;

	for (const line of lines) {
		if (/^[ \t]/u.test(line)) {
			if (!skippingContinuation) {
				normalizedLines.push(line);
			}
			continue;
		}

		skippingContinuation = /^message-id\s*:/iu.test(line);
		if (skippingContinuation) {
			if (!foundMessageId) {
				normalizedLines.push(`Message-ID: ${messageId}`);
				foundMessageId = true;
			}
			continue;
		}
		normalizedLines.push(line);
	}

	if (!foundMessageId) {
		normalizedLines.unshift(`Message-ID: ${messageId}`);
	}

	const encodedHeaders = new TextEncoder().encode(
		normalizedLines.join(lineEnding)
	);
	const separator = usesCrlf ? crlfSeparator : lfSeparator;
	const body = rawEmail.subarray(headerEnd + separator.byteLength);
	const normalizedEmail = new Uint8Array(
		encodedHeaders.byteLength + separator.byteLength + body.byteLength
	);
	normalizedEmail.set(encodedHeaders);
	normalizedEmail.set(separator, encodedHeaders.byteLength);
	normalizedEmail.set(body, encodedHeaders.byteLength + separator.byteLength);
	return normalizedEmail;
}

function findSequence(bytes: Uint8Array, sequence: Uint8Array): number {
	for (
		let index = 0;
		index <= bytes.byteLength - sequence.byteLength;
		index++
	) {
		if (
			sequence.every(
				(value, sequenceIndex) => bytes[index + sequenceIndex] === value
			)
		) {
			return index;
		}
	}
	return -1;
}

/**
 * Derives the id an email is indexed under from its Message-ID by stripping the
 * enclosing angle brackets.
 *
 * This id keys the local explorer record, so a message listed in the explorer
 * can be looked up by it.
 */
export function messageIdToStorageId(messageId: string): string {
	return messageId.replace(/^<|>$/g, "");
}

/**
 * Extracts the bare email address from a string that may be in `"Name"
 * <address>`, `Name <address>`, or plain `address` form.
 */
export function extractAddressFromString(value: string): string {
	const match = value.match(/<([^>]+)>\s*$/u);
	return (match ? match[1] : value).trim();
}
