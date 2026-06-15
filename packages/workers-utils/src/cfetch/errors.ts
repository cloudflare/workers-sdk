import { ParseError } from "../parse";

export interface FetchError {
	code: number;
	documentation_url?: string;
	message: string;
	error_chain?: FetchError[];
	/**
	 * Optional structured error metadata returned alongside the message. The
	 * Cloudflare v4 envelope permits a `meta` object whose shape varies by
	 * endpoint; consumers are expected to validate the shape at use site
	 * before relying on any field.
	 *
	 * Known usage: the EWC declarative DO exports flow returns
	 * `meta.details` as an array of per-class reconciliation errors. See
	 * `ExportsReconciliationErrorDetail` in `../types.ts`.
	 */
	meta?: { details?: unknown } & Record<string, unknown>;
}

function buildDetailedError(message: string, ...extra: string[]) {
	return new ParseError({
		text: message,
		notes: extra.map((text) => ({ text })),
		telemetryMessage: false,
	});
}

export function maybeThrowFriendlyError(error: FetchError) {
	if (error.message === "workers.api.error.email_verification_required") {
		throw buildDetailedError(
			"Please verify your account's email address and try again.",
			"Check your email for a verification link, or login to https://dash.cloudflare.com and request a new one."
		);
	}
}
