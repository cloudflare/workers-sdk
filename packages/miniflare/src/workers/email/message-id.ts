// Message-ID handling shared by the paths that capture emails: the `send_email`
// binding and the local explorer's "send test email" endpoint. Both must agree
// on the format, because the id derived from a Message-ID keys the explorer's
// record.

const ID_ALPHABET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const MESSAGE_ID_DOMAIN_LABEL =
	/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u;
const MESSAGE_ID_DOMAIN_LITERAL =
	/^\[(?:[\x21-\x5a\x5e-\x7e]|\\[\x20-\x7e])+\]$/u;

function extractTrailingDomainLiteral(senderEmail: string): string | undefined {
	const literalStart = senderEmail.lastIndexOf("@[");
	if (literalStart === -1) {
		return undefined;
	}
	const literal = senderEmail.slice(literalStart + 1);
	return MESSAGE_ID_DOMAIN_LITERAL.test(literal) ? literal : undefined;
}

function normalizeDnsDomain(value: string): string | undefined {
	if (value === "" || /[\s/:?#@\[\]\\<>%]/u.test(value)) {
		return undefined;
	}
	let hostname: string;
	try {
		const url = new URL(`http://${value}`);
		if (
			url.username !== "" ||
			url.password !== "" ||
			url.port !== "" ||
			url.pathname !== "/" ||
			url.search !== "" ||
			url.hash !== ""
		) {
			return undefined;
		}
		hostname = url.hostname;
	} catch {
		return undefined;
	}

	const unqualified = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
	if (
		hostname.length > 254 ||
		unqualified === "" ||
		!unqualified
			.split(".")
			.every((label) => MESSAGE_ID_DOMAIN_LABEL.test(label))
	) {
		return undefined;
	}
	return hostname;
}

function getMessageIdDomain(senderEmail: string): string {
	const literal = extractTrailingDomainLiteral(senderEmail);
	if (literal !== undefined) {
		return literal;
	}
	const separator = senderEmail.lastIndexOf("@");
	const domain =
		separator === -1
			? undefined
			: normalizeDnsDomain(senderEmail.slice(separator + 1));
	return domain ?? "localhost";
}

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
	const domain = getMessageIdDomain(senderEmail);
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

	const fields = findHeaderFields(rawEmail, headerEnd);
	const lastField = fields.at(-1);
	if (lastField !== undefined) {
		lastField.end += usesCrlf ? 2 : 1;
	}
	const messageIdFields = fields.filter(({ start, nameEnd }) =>
		asciiEqualsIgnoreCase(rawEmail.subarray(start, nameEnd), "message-id")
	);
	const replacement = new TextEncoder().encode(`Message-ID: ${messageId}`);
	if (messageIdFields.length === 0) {
		const lineEnding = usesCrlf
			? new Uint8Array([13, 10])
			: new Uint8Array([10]);
		return concatenateBytes([
			replacement,
			...(headerEnd === 0 ? [] : [lineEnding]),
			rawEmail,
		]);
	}

	const chunks: Uint8Array[] = [];
	let retainedOffset = 0;
	for (const [index, field] of messageIdFields.entries()) {
		chunks.push(rawEmail.subarray(retainedOffset, field.start));
		if (index === 0) {
			chunks.push(replacement);
			const terminator = getFieldTerminator(rawEmail, field.start, field.end);
			if (terminator !== undefined) {
				chunks.push(terminator);
			}
		}
		retainedOffset = field.end;
	}
	chunks.push(rawEmail.subarray(retainedOffset));
	return concatenateBytes(chunks);
}

interface HeaderFieldRange {
	start: number;
	nameEnd: number;
	end: number;
}

function findHeaderFields(
	rawEmail: Uint8Array,
	headerEnd: number
): HeaderFieldRange[] {
	const fields: HeaderFieldRange[] = [];
	let hasActiveField = false;
	let offset = 0;
	while (offset < headerEnd) {
		let lineEnd = offset;
		while (lineEnd < headerEnd && rawEmail[lineEnd] !== 10) {
			lineEnd++;
		}
		const contentEnd =
			lineEnd > offset && rawEmail[lineEnd - 1] === 13 ? lineEnd - 1 : lineEnd;
		const continuation = rawEmail[offset] === 32 || rawEmail[offset] === 9;
		if (continuation) {
			if (!hasActiveField) {
				throw new Error("email header block contains an invalid continuation");
			}
		} else {
			const previous = fields.at(-1);
			if (previous !== undefined && hasActiveField) {
				previous.end = offset;
			}
			hasActiveField = false;
			let colon = offset;
			while (colon < contentEnd && rawEmail[colon] !== 58) {
				colon++;
			}
			if (colon >= contentEnd) {
				throw new Error("email header block contains an invalid field");
			}
			let nameEnd = colon;
			while (
				nameEnd > offset &&
				(rawEmail[nameEnd - 1] === 32 || rawEmail[nameEnd - 1] === 9)
			) {
				nameEnd--;
			}
			if (nameEnd === offset) {
				throw new Error("email header block contains an invalid field name");
			}
			fields.push({ start: offset, nameEnd, end: headerEnd });
			hasActiveField = true;
		}
		offset = lineEnd < headerEnd ? lineEnd + 1 : headerEnd;
	}
	return fields;
}

function asciiEqualsIgnoreCase(bytes: Uint8Array, expected: string): boolean {
	if (bytes.byteLength !== expected.length) {
		return false;
	}
	for (let index = 0; index < bytes.byteLength; index++) {
		const byte = bytes[index];
		const lower = byte >= 65 && byte <= 90 ? byte + 32 : byte;
		if (lower !== expected.charCodeAt(index)) {
			return false;
		}
	}
	return true;
}

function getFieldTerminator(
	bytes: Uint8Array,
	start: number,
	end: number
): Uint8Array | undefined {
	if (end > start && bytes[end - 1] === 10) {
		return end - start >= 2 && bytes[end - 2] === 13
			? bytes.subarray(end - 2, end)
			: bytes.subarray(end - 1, end);
	}
	return undefined;
}

function concatenateBytes(chunks: Uint8Array[]): Uint8Array {
	const result = new Uint8Array(
		chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
	);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
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
