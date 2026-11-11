import { Toucan } from "toucan-js";
import { ZodError } from "zod";
import { HttpError, ZodSchemaError } from "./errors";

/**
 * The part of the preview worker that reported an event: the entry Worker that
 * receives requests, or the `UserSession` Durable Object behind it.
 */
export type SentryHop = "entry" | "session";

/**
 * The runtime replaces the details of its own internal failures with a random
 * reference, which makes every message unique. Sentry groups by message when an
 * event has no stack, so without a fixed fingerprint each failure becomes a new
 * issue and a new alert.
 */
const RUNTIME_INTERNAL_ERROR = /^internal error; reference = (\S+)/;

export function handleException(e: unknown, sentry: Toucan): Response {
	console.error(e);
	if (e instanceof ZodError) {
		e = new ZodSchemaError(e.issues);
	}

	if (e instanceof HttpError) {
		if (e.reportable) {
			sentry.setContext("Details", e.data);
			sentry.captureException(e);
		}
		return e.toResponse();
	} else {
		sentry.captureException(e);
		return Response.json(
			{
				error: "UnexpectedError",
				message: "Something went wrong",
			},
			{
				status: 500,
			}
		);
	}
}

/**
 * Creates the Sentry client for one request, tagged with the hop that handles it.
 *
 * @param options.request The request being handled, recorded with an allowlist of headers.
 * @param options.context The execution context, when the hop has one, so events are sent before the request ends.
 * @param options.env The Worker environment, which supplies the DSN, Access credentials and version metadata.
 * @param options.hop The part of the preview worker that handles the request.
 * @returns A Sentry client scoped to the request.
 */
export function setupSentry({
	request,
	context,
	env,
	hop,
}: {
	request: Request;
	context: ExecutionContext | undefined;
	env: Env;
	hop: SentryHop;
}): Toucan {
	// The testing environment has no Access credentials for Sentry. Without a
	// DSN, Toucan drops events instead of sending requests that Access rejects.
	const accessHeaders =
		env.SENTRY_ACCESS_CLIENT_ID && env.SENTRY_ACCESS_CLIENT_SECRET
			? {
					"CF-Access-Client-ID": env.SENTRY_ACCESS_CLIENT_ID,
					"CF-Access-Client-Secret": env.SENTRY_ACCESS_CLIENT_SECRET,
				}
			: undefined;
	const sentry = new Toucan({
		dsn: accessHeaders ? env.SENTRY_DSN : undefined,
		release: env.CF_VERSION_METADATA.id,
		request,
		context,
		requestDataOptions: {
			allowedHeaders: [
				"user-agent",
				"accept-encoding",
				"accept-language",
				"cf-ray",
				"content-length",
				"content-type",
				"host",
				// These tell a browser embedding a preview apart from a script calling it.
				"origin",
				"referer",
				"sec-fetch-dest",
				"sec-fetch-mode",
				"sec-fetch-site",
			],
		},
		transportOptions: { headers: accessHeaders },
		beforeSend(event) {
			const message = event.exception?.values?.[0]?.value;
			const reference =
				message === undefined
					? undefined
					: RUNTIME_INTERNAL_ERROR.exec(message)?.[1];
			if (reference !== undefined) {
				event.fingerprint = ["runtime-internal-error", hop];
				// Keep each reference searchable, so it can be traced in the runtime's logs.
				event.tags = { ...event.tags, runtime_reference: reference };
			}
			return event;
		},
	});
	sentry.setTag("hop", hop);
	return sentry;
}

/**
 * Tags events with the preview a request is for. Both hops can derive these,
 * because the entry Worker forwards the preview's URL and headers to the session.
 *
 * @param sentry The Sentry client for the request.
 * @param request A request to run the preview Worker.
 */
export function setPreviewTags(sentry: Toucan, request: Request): void {
	sentry.setTags({
		preview_host: new URL(request.url).hostname,
		preview_route: request.headers.has("cf-raw-http") ? "raw-http" : "cookie",
	});
}

/**
 * Derives a stable tag for a preview session. The session ID is also the bearer
 * token that authorises preview requests, so it must not be sent to Sentry.
 *
 * @param sessionId The `UserSession` Durable Object ID.
 * @returns The first 16 hex characters of the ID's SHA-256 hash.
 */
export async function hashSessionId(sessionId: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(sessionId)
	);
	return [...new Uint8Array(digest).slice(0, 8)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}
