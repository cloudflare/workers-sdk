import type { $ZodIssue } from "zod/v4/core";

export class HttpError extends Error {
	constructor(
		message: string,
		readonly status: number,
		// Only report errors to sentry when they represent actionable errors
		readonly reportable: boolean
	) {
		super(message);
		Object.setPrototypeOf(this, new.target.prototype);
	}
	toResponse() {
		return Response.json(
			{
				error: this.name,
				message: this.message,
				data: this.data,
			},
			{
				status: this.status,
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "GET,PUT,POST",
				},
			}
		);
	}

	get data(): Record<string, unknown> {
		return {};
	}
}

export class WorkerTimeout extends HttpError {
	name = "WorkerTimeout";
	constructor() {
		super("Worker timed out", 400, false);
	}

	toResponse(): Response {
		return new Response("Worker timed out");
	}
}

export class ServiceWorkerNotSupported extends HttpError {
	name = "ServiceWorkerNotSupported";
	constructor() {
		super(
			"Service Workers are not supported in the Workers Playground",
			400,
			false
		);
	}
}
export class ZodSchemaError extends HttpError {
	name = "ZodSchemaError";
	constructor(private issues: $ZodIssue[]) {
		super("Something went wrong", 500, true);
	}

	get data(): { issues: string } {
		return { issues: JSON.stringify(this.issues) };
	}
}

export class PreviewError extends HttpError {
	name = "PreviewError";
	constructor(private error: string) {
		super(error, 400, false);
	}

	get data(): { error: string } {
		return { error: this.error };
	}
}

export class TokenUpdateFailed extends HttpError {
	name = "TokenUpdateFailed";
	constructor() {
		super("Provide valid token", 400, false);
	}
}

export class RawHttpFailed extends HttpError {
	name = "RawHttpFailed";
	constructor() {
		super("Provide valid token", 400, false);
	}
}

export class PreviewRequestFailed extends HttpError {
	name = "PreviewRequestFailed";
	constructor(
		private tokenId: string | undefined,
		reportable: boolean
	) {
		super("Valid token not found", 400, reportable);
	}
	get data(): { tokenId: string | undefined } {
		return { tokenId: this.tokenId };
	}
}

export class UploadFailed extends HttpError {
	name = "UploadFailed";
	constructor() {
		super("Valid token not provided", 401, false);
	}
}

export class PreviewRequestForbidden extends HttpError {
	name = "PreviewRequestForbidden";
	constructor() {
		super("Preview request forbidden", 403, false);
	}
}

export class BadUpload extends HttpError {
	name = "BadUpload";
	constructor(
		message = "Invalid upload",
		private readonly error?: string
	) {
		super(message, 400, false);
	}
	get data() {
		return { error: this.error };
	}
}
