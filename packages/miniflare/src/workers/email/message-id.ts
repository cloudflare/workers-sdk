// Message-ID handling shared by the paths that capture emails: the `send_email`
// binding and the local explorer's "send test email" endpoint. Both must agree
// on the format, because the id derived from a Message-ID keys the explorer's
// record and names the files written to disk.

const ID_ALPHABET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Builds a Message-ID in the shape the production `send_email` binding returns:
 * `<{36 alphanumeric chars}@{sender domain}>`.
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
 * Derives the id an email is stored under from its Message-ID, by stripping the
 * enclosing angle brackets (`<id@domain>` becomes `id@domain`).
 *
 * This id keys the local explorer record and names the files written to disk, so
 * a message listed in the explorer can be found on disk by its id.
 */
export function messageIdToStorageId(messageId: string): string {
	return messageId.replace(/^<|>$/g, "");
}

/**
 * Case-insensitive lookup of a header value in a `Record` of headers, so a
 * caller-supplied Message-ID is honoured whatever casing it uses.
 */
export function getHeader(
	headers: Record<string, string> | undefined,
	name: string
): string | undefined {
	if (headers === undefined) {
		return undefined;
	}
	const target = name.toLowerCase();
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === target) {
			return value;
		}
	}
	return undefined;
}
