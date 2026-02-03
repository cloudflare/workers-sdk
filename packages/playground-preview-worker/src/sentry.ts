import { Toucan } from "toucan-js";
import { $ZodError } from "zod/v4/core";
import { HttpError, ZodSchemaError } from "./errors";

export function handleException(e: unknown, sentry: Toucan): Response {
	console.error(e);
	if (e instanceof $ZodError) {
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
export function setupSentry(
	request: Request,
	context: ExecutionContext | undefined,
	dsn: string,
	clientId: string,
	clientSecret: string
): Toucan {
	return new Toucan({
		dsn,
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
			],
		},
		transportOptions: {
			headers: {
				"CF-Access-Client-ID": clientId,
				"CF-Access-Client-Secret": clientSecret,
			},
		},
	});
}
