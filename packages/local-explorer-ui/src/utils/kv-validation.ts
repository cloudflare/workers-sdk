// KV key size limit per Cloudflare docs
export const MAX_KEY_BYTES = 512;

/**
 * Validates a KV key and returns an error message if invalid, or null if valid.
 */
export function validateKey(key: string): string | null {
	if (!key.trim()) {
		return "Key is required";
	}
	const byteLength = new TextEncoder().encode(key).length;
	if (byteLength > MAX_KEY_BYTES) {
		return `Key must be ${MAX_KEY_BYTES} bytes or less (currently ${byteLength} bytes)`;
	}
	return null;
}
