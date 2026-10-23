/** Validate an exact StringOrURI audience without fetching or normalizing it. */
export function validOidcAudience(value: unknown): value is string {
	if (
		typeof value !== "string" ||
		!value.isWellFormed() ||
		!value.trim() ||
		new TextEncoder().encode(value).length > 2048
	) {
		return false;
	}
	if (!value.includes(":")) {
		return true;
	}
	if (
		!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) ||
		/[^\x21-\x7e]/.test(value) ||
		/%(?![A-Fa-f0-9]{2})/.test(value)
	) {
		return false;
	}
	try {
		new URL(value);
		return true;
	} catch {
		return false;
	}
}

/** Validate a binding request. The API independently resolves its approved assignment. */
export function isOidcBinding(value: unknown): boolean {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const v = value as Record<string, unknown>;
	if (
		Object.keys(v).some(
			(k) =>
				!["binding", "identity_id", "audience", "allowed_audiences"].includes(k)
		)
	) {
		return false;
	}
	if (
		![v.binding, v.identity_id].every(
			(x) => typeof x === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(x)
		)
	) {
		return false;
	}
	if (!validOidcAudience(v.audience)) {
		return false;
	}
	const a = v.allowed_audiences;
	return (
		a === undefined ||
		(Array.isArray(a) &&
			a.length > 0 &&
			a.length <= 64 &&
			a.every(validOidcAudience) &&
			new Set(a).size === a.length &&
			a.includes(v.audience))
	);
}
