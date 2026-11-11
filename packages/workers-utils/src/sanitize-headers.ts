const safeHeaders = new Set([
	"accept",
	"accept-encoding",
	"content-type",
	"content-length",
	"content-encoding",
	"transfer-encoding",
	"user-agent",
	"cf-ray",
	"date",
	"server",
	"retry-after",
	"retry-after-ms",
]);

/** Redact header values outside the diagnostic allowlist, even in unsanitized logs. */
export function sanitizeHeaders(
	headers: Iterable<readonly [string, string]>
): Record<string, string> {
	return Object.fromEntries(
		Array.from(headers, ([name, value]) => [
			name,
			safeHeaders.has(name.toLowerCase()) ? value : "[REDACTED]",
		])
	);
}
