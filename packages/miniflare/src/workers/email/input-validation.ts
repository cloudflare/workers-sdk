const TOKEN_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/u;

export function hasControlCharacters(value: string): boolean {
	return /[\u0000-\u001f\u007f]/u.test(value);
}

export function isMimeType(value: string): boolean {
	const separator = value.indexOf("/");
	return (
		separator > 0 &&
		separator === value.lastIndexOf("/") &&
		TOKEN_PATTERN.test(value.slice(0, separator)) &&
		TOKEN_PATTERN.test(value.slice(separator + 1))
	);
}

export function normalizeBase64(value: string): string | undefined {
	const normalized = value.replace(/\s/gu, "");
	if (normalized.length % 4 !== 0 || !BASE64_PATTERN.test(normalized)) {
		return undefined;
	}
	try {
		atob(normalized);
		return normalized;
	} catch {
		return undefined;
	}
}
