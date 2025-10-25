import { ParseError } from "@cloudflare/workers-utils";

export interface FetchError {
	code: number;
	documentation_url?: string;
	message: string;
	error_chain?: FetchError[];
}

function buildDetailedError(message: string, ...extra: string[]) {
	return new ParseError({
		text: message,
		notes: extra.map((text) => ({ text })),
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
