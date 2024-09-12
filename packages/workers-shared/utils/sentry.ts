import { Toucan } from "toucan-js";

export function setupSentry(
	request: Request,
	context: ExecutionContext | undefined,
	dsn: string,
	clientId: string,
	clientSecret: string
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
	const colo = request.cf?.colo ?? "UNKNOWN";
	sentry.setTag("colo", colo as string);

	const userAgent = request.headers.get("user-agent") ?? "UA UNKNOWN";
	sentry.setUser({ userAgent: userAgent, colo: colo });
	return sentry;
}
