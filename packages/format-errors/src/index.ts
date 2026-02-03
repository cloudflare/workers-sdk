import prom from "promjs";
import { Toucan } from "toucan-js";
import * as z from "zod/v4";
import Youch from "./Youch";

export interface Env {
	PROMETHEUS_TOKEN: string;
	SENTRY_ACCESS_CLIENT_SECRET: string;
	SENTRY_ACCESS_CLIENT_ID: string;
	SENTRY_DSN: string;
}
export interface JsonError {
	message?: string;
	name?: string;
	stack?: string;
	cause?: JsonError;
}
export interface Payload {
	url?: string;
	method?: string;
	headers?: Record<string, string>;
	error?: JsonError;
}
export const JsonErrorSchema: z.ZodType<JsonError> = z.lazy(() =>
	z.object({
		message: z.string().optional(),
		name: z.string().optional(),
		stack: z.string().optional(),
		cause: JsonErrorSchema.optional(),
	})
);

export const PayloadSchema = z.object({
	url: z.string().optional(),
	method: z.string().optional(),
	headers: z.record(z.string()),
	error: JsonErrorSchema.optional(),
});

interface StandardErrorConstructor {
	new (message?: string, options?: { cause?: Error }): Error;
}
const ALLOWED_ERROR_SUBCLASS_CONSTRUCTORS: StandardErrorConstructor[] = [
	EvalError,
	RangeError,
	ReferenceError,
	SyntaxError,
	TypeError,
	URIError,
];
export function reviveError(jsonError: JsonError): Error {
	// At a high level, this function takes a JSON-serialisable representation of
	// an `Error`, and converts it to an `Error`. `Error`s may have `cause`s, so
	// we need to do this recursively.
	let cause: Error | undefined;
	if (jsonError.cause !== undefined) {
		cause = reviveError(jsonError.cause);
	}

	// If this is one of the built-in error types, construct an instance of that.
	// For example, if we threw a `TypeError` in the Worker, we'd like to
	// construct a `TypeError` here, so it looks like the error has been thrown
	// through a regular function call, not an HTTP request (i.e. we want
	// `instanceof TypeError` to pass in Node for `TypeError`s thrown in Workers).
	let ctor: StandardErrorConstructor = Error;
	if (jsonError.name !== undefined && jsonError.name in globalThis) {
		const maybeCtor = (globalThis as Record<string, unknown>)[
			jsonError.name
		] as StandardErrorConstructor;
		if (ALLOWED_ERROR_SUBCLASS_CONSTRUCTORS.includes(maybeCtor)) {
			ctor = maybeCtor;
		}
	}

	// Construct the error, copying over the correct name and stack trace.
	// Because constructing an `Error` captures the stack trace at point of
	// construction, we override the stack trace to the one from the Worker in the
	// JSON-serialised error.
	const error = new ctor(jsonError.message, { cause });
	if (jsonError.name !== undefined) {
		error.name = jsonError.name;
	}
	error.stack = jsonError.stack;

	return error;
}

export async function handlePrettyErrorRequest({
	error: jsonError,
	url,
	method,
	headers,
}: Payload): Promise<Response> {
	// Parse and validate the error we've been given from user code
	const caught = JsonErrorSchema.parse(jsonError);

	// Convert the error into a regular `Error` object and try to source-map it.
	// We need to give `name`, `message` and `stack` to Youch, but StackTracy,
	// Youch's dependency for parsing `stack`s, will only extract `stack` from
	// an object if it's an `instanceof Error`.
	const error = reviveError(caught);

	// Log source-mapped error to console if logging enabled

	// Lazily import `youch` when required
	// `cause` is usually more useful than the error itself, display that instead
	// TODO(someday): would be nice if we could display both
	const youch = new Youch(error.cause ?? error, {
		url,
		method,
		headers,
	});
	youch.addLink(() => {
		return [
			'<a href="https://developers.cloudflare.com/workers/" target="_blank" style="text-decoration:none">📚 Workers Docs</a>',
			'<a href="https://discord.cloudflare.com" target="_blank" style="text-decoration:none">💬 Workers Discord</a>',
		].join("");
	});
	return new Response(await youch.toHTML(), {
		headers: { "Content-Type": "text/html;charset=utf-8" },
	});
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const registry = prom();
		const requestCounter = registry.create(
			"counter",
			"devprod_format_errors_request_total",
			"Request counter for DevProd's format-errors service"
		);
		requestCounter.inc();

		const sentry = new Toucan({
			dsn: env.SENTRY_DSN,
			context: ctx,
			request,
			requestDataOptions: {
				allowedHeaders: [
					"user-agent",
					"accept-encoding",
					"accept-language",
					"cf-ray",
					"content-length",
					"content-type",
					"host",
				],
			},
			transportOptions: {
				headers: {
					"CF-Access-Client-ID": env.SENTRY_ACCESS_CLIENT_ID,
					"CF-Access-Client-Secret": env.SENTRY_ACCESS_CLIENT_SECRET,
				},
			},
		});

		// Validate payload outside of Sentry/metrics reporting
		let payload: Payload;
		try {
			payload = PayloadSchema.parse(await request.json());
		} catch {
			return new Response("Invalid payload", { status: 400 });
		}

		try {
			return handlePrettyErrorRequest(payload);
		} catch (e) {
			sentry.captureException(e);
			const errorCounter = registry.create(
				"counter",
				"devprod_format_errors_error_total",
				"Error counter for DevProd's format-errors service"
			);
			errorCounter.inc();

			return Response.json(
				{
					error: "UnexpectedError",
					message: "Something went wrong",
				},
				{
					status: 500,
				}
			);
		} finally {
			ctx.waitUntil(
				fetch("https://workers-logging.cfdata.org/prometheus", {
					method: "POST",
					headers: {
						Authorization: `Bearer ${env.PROMETHEUS_TOKEN}`,
					},
					body: registry.metrics(),
				})
			);
		}
	},
};
