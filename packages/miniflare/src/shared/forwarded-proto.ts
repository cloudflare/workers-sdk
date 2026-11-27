/**
 * Parses the original client protocol from an `X-Forwarded-Proto` header.
 *
 * @param value - The header value, potentially containing a comma-separated proxy chain.
 * @returns The first protocol, or `undefined` if it is missing or unsupported.
 */
export function parseForwardedProto(
	value: string | null | undefined
): "http:" | "https:" | undefined {
	const protocol = value?.split(",")[0]?.trim().toLowerCase();
	if (protocol === "http" || protocol === "https") {
		return `${protocol}:`;
	}
	return undefined;
}
