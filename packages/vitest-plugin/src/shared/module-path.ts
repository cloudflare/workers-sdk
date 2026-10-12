// Sentinel prepended to encoded module paths so the fallback service knows
// deterministically when they must be decoded. It is a leading, rooted segment
// because workerd preserves those segments when resolving relative imports,
// allowing the marker to propagate to every descendant module.
// See https://github.com/cloudflare/workers-sdk/issues/14655
// See https://github.com/cloudflare/workers-sdk/issues/15048
export const ENCODED_PATH_PREFIX = "/__mf_vitest_encoded__";

/**
 * Marks encoded file URLs so the module fallback service can decode them
 * without guessing whether percent sequences are URL encoding or literal path
 * characters.
 *
 * @param url - The module URL Vitest uses as the base for `createRequire()`.
 * @returns The marked file URL, or the original value when decoding isn't needed.
 */
export function markCreateRequireUrl(url: string): string {
	if (!url.startsWith("file:")) {
		return url;
	}

	const parsedUrl = new URL(url);
	if (
		!parsedUrl.pathname.includes("%") ||
		parsedUrl.pathname.startsWith(ENCODED_PATH_PREFIX)
	) {
		return url;
	}

	parsedUrl.pathname = `${ENCODED_PATH_PREFIX}${parsedUrl.pathname}`;
	return parsedUrl.href;
}
