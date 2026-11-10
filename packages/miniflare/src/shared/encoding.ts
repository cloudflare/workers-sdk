// These are the encodings workerd can automatically apply to response bodies.
const supportedEncodings = ["gzip", "br", "identity"];
const acceptEncodingElement =
	/^(?<coding>[a-z]+|\*)(?:\s*;\s*q=(?<weight>0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?$/i;

/** Parses explicit encodings and weights without applying negotiation defaults. */
function parseAcceptEncoding(header: string): Map<string, number> {
	const encodings = new Map<string, number>();
	for (const element of header.split(",")) {
		const match = acceptEncodingElement.exec(element.trim());
		if (match?.groups !== undefined) {
			encodings.set(
				match.groups.coding.toLowerCase(),
				match.groups.weight === undefined ? 1 : Number(match.groups.weight)
			);
		}
	}
	return encodings;
}

/**
 * Selects an encoding accepted by the client, preserving the Worker's encoding
 * when possible and preferring identity over adding compression in local dev.
 *
 * @param clientAcceptEncoding - The original client request's Accept-Encoding header.
 * @param contentEncoding - The Worker's Content-Encoding header, before automatic encoding.
 * @returns The encoding to use, or undefined if no supported encoding is acceptable.
 */
export function selectResponseEncoding(
	clientAcceptEncoding: string | null,
	contentEncoding: string | null
): string | undefined {
	const currentEncoding = contentEncoding ?? "identity";
	// Leave manually encoded responses alone: workerd cannot transcode them.
	if (
		!supportedEncodings.includes(currentEncoding) ||
		clientAcceptEncoding === null
	) {
		return currentEncoding;
	}

	const encodings = parseAcceptEncoding(clientAcceptEncoding);
	const wildcardWeight = encodings.get("*");
	const defaultIdentityWeight = wildcardWeight === 0 ? 0 : 1;
	function weightFor(coding: string): number {
		return (
			encodings.get(coding) ??
			(coding === "identity" ? defaultIdentityWeight : (wildcardWeight ?? 0))
		);
	}

	// RFC 9110 permits identity unless identity;q=0 or *;q=0 excludes it.
	// A more specific entry always takes precedence over the wildcard.
	if (weightFor(currentEncoding) > 0) {
		return currentEncoding;
	}
	if (weightFor("identity") > 0) {
		return "identity";
	}

	// Preserve the client's ordering for equal weights, including wildcard matches.
	return Array.from(new Set([...encodings.keys(), ...supportedEncodings]))
		.filter((coding) => supportedEncodings.includes(coding))
		.sort((a, b) => weightFor(b) - weightFor(a))
		.find((coding) => weightFor(coding) > 0);
}
