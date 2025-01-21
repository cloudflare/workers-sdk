import { Toucan } from "toucan-js";
import type { ColoMetadata } from "./types";

export function setupSentry(
	request: Request,
	context: ExecutionContext | undefined,
	dsn: string,
	clientId: string,
	clientSecret: string,
	coloMetadata?: ColoMetadata,
	accountId?: number,
	scriptId?: number
): Toucan | undefined {
	// Are we running locally without access to Sentry secrets? If so, don't initialise Sentry
	if (!(dsn && clientId && clientSecret)) {
		return undefined;
	}
	const sentry = new Toucan({
		dsn,
		request,
		context,
		sampleRate: 1.0,
		requestDataOptions: {
			allowedHeaders: [
				"user-agent",
				"cf-challenge",
				"accept-encoding",
				"accept-language",
				"cf-ray",
				"content-length",
				"content-type",
				"host",
			],
			allowedSearchParams: /(.*)/,
		},

		transportOptions: {
			headers: {
				"CF-Access-Client-ID": clientId,
				"CF-Access-Client-Secret": clientSecret,
			},
		},
	});

	if (coloMetadata) {
		sentry.setTag("colo", coloMetadata.coloId);
		sentry.setTag("metal", coloMetadata.metalId);
	}

	if (accountId && scriptId) {
		sentry.setTag("accountId", accountId);
		sentry.setTag("scriptId", scriptId);
	}

	sentry.setUser({ id: accountId?.toString() });

	return sentry;
}
