/** Sanitized issuance failures, classified without inspecting API error bodies. */
export class DevelopmentOidcApiError extends Error {
	constructor(
		message: string,
		readonly kind:
			| "invalid"
			| "login_required"
			| "access_denied"
			| "session_renewal"
			| "rate_limited"
			| "unavailable" = "invalid",
		readonly retryAfterMs?: number
	) {
		super(message);
	}
}
