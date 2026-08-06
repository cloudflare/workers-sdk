// Message-ID handling shared by the paths that capture emails: the `send_email`
// binding and the local explorer's "send test email" endpoint. Both must agree
// on the format, because the id derived from a Message-ID keys the explorer's
// record.

/**
 * Builds a Message-ID in the shape the `mimetext` library generates for emails
 * created via `createMimeMessage()`: `<{base36 random}@{sender domain}>`. Used
 * as a fallback when no Message-ID is otherwise available, so a synthesized id
 * matches the format callers see everywhere else.
 */
export function synthesizeMessageId(senderEmail: string): string {
	const id = Math.random().toString(36).slice(2);
	const domain = senderEmail.slice(senderEmail.lastIndexOf("@") + 1);
	return `<${id}@${domain}>`;
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
