import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { Toucan } from "toucan-js";
import { ZodIssue } from "zod";
import { handleException, setupSentry } from "./sentry";
const app = new Hono<{ Bindings: Env; Variables: { sentry: Toucan } }>({
	// This replaces . with / in url hostnames, which allows for parameter matching in hostnames as well as paths
	// e.g. https://something.example.com/hello/world -> something/example/com/hello/world
	getPath: (req) => {
		const url = new URL(req.url);
		return url.hostname.replaceAll(".", "/") + url.pathname;
	},
});

const rootDomain = ROOT;
const previewDomain = PREVIEW;
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
					"Access-Control-Allow-Method": "GET,PUT,POST",
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
	constructor(private issues: ZodIssue[]) {
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

class TokenUpdateFailed extends HttpError {
	name = "TokenUpdateFailed";
	constructor() {
		super("Provide token", 400, false);
	}
}

class RawHttpFailed extends HttpError {
	name = "RawHttpFailed";
	constructor() {
		super("Provide token", 400, false);
	}
}

class PreviewRequestFailed extends HttpError {
	name = "PreviewRequestFailed";
	constructor(private tokenId: string | undefined, reportable: boolean) {
		super("Token not found", 400, reportable);
	}
	get data(): { tokenId: string | undefined } {
		return { tokenId: this.tokenId };
	}
}

class UploadFailed extends HttpError {
	name = "UploadFailed";
	constructor() {
		super("Token not provided", 401, false);
	}
}

/**
 * Given a preview token, this endpoint allows for raw http calls to be inspected
 *
 * It requires one parameter, passed as a header:
 *  - `X-CF-Token`  A preview token, as in /.update-preview-token
 */
async function handleRawHttp(request: Request, url: URL, env: Env) {
	const token = request.headers.get("X-CF-Token");
	if (!token) {
		throw new RawHttpFailed();
	}

	const userObject = env.UserSession.get(env.UserSession.idFromString(token));

	// Delete these consumed headers so as not to bloat the request.
	// Some tokens can be quite large and may cause nginx to reject the
	// request due to exceeding size limits if the value is included twice.

	const headers = new Headers(request.headers);
	headers.delete("X-CF-Token");

	const workerResponse = await userObject.fetch(
		url,
		new Request(request, {
			headers: {
				...Object.fromEntries(headers),
				"cf-run-user-worker": "true",
			},
			redirect: "manual",
		})
	);

	// The client needs the raw headers from the worker
	// Prefix them with `cf-ew-raw-`, so that response headers from _this_ worker don't interfere
	const rawHeaders: Record<string, string> = {};
	for (const header of workerResponse.headers.entries()) {
		rawHeaders[`cf-ew-raw-${header[0]}`] = header[1];
	}
	return new Response(workerResponse.body, {
		...workerResponse,
		headers: {
			...rawHeaders,
			"Access-Control-Allow-Origin": request.headers.get("Origin") ?? "",
			"Access-Control-Allow-Method": "*",
			"Access-Control-Allow-Credentials": "true",
			"cf-ew-status": workerResponse.status.toString(),
			"Access-Control-Expose-Headers": "*",
			Vary: "Origin",
		},
	});
}
app.use("*", async (c, next) => {
	c.set(
		"sentry",
		setupSentry(
			c.req.raw,
			c.executionCtx,
			c.env.SENTRY_DSN,
			c.env.SENTRY_ACCESS_CLIENT_ID,
			c.env.SENTRY_ACCESS_CLIENT_SECRET
		)
	);
	return await next();
});

app.get(`${rootDomain}/`, async (c) => {
	const url = new URL(c.req.url);
	let userId = getCookie(c, "user");

	if (!userId) {
		userId = c.env.UserSession.newUniqueId().toString();
		setCookie(c, "user", userId, {
			secure: true,
			sameSite: "None",
			httpOnly: true,
			domain: url.hostname,
		});
	}
	const cookified = c.body(null);
	const origin = await fetch(c.req.url, c.req);
	const mutable = new Response(origin.body, origin);
	const setCookieHeader = cookified.headers.get("Set-Cookie");
	if (setCookieHeader !== null)
		mutable.headers.set("Set-Cookie", setCookieHeader);

	return mutable;
});

app.post(`${rootDomain}/api/worker`, async (c) => {
	let userId = getCookie(c, "user");

	if (!userId) {
		throw new UploadFailed();
	}

	const userObject = c.env.UserSession.get(
		c.env.UserSession.idFromString(userId)
	);

	return userObject.fetch("https://example.com", {
		body: c.req.body,
		method: "POST",
		headers: c.req.headers,
	});
});

app.get(`${rootDomain}/api/inspector`, async (c) => {
	const url = new URL(c.req.url);
	let userId = url.searchParams.get("user");

	if (!userId) {
		throw new PreviewRequestFailed("", false);
	}

	const userObject = c.env.UserSession.get(
		c.env.UserSession.idFromString(userId)
	);

	return userObject.fetch(c.req.raw);
});

/**
 * Given a preview session, the client should obtain a specific preview token
 * This endpoint takes in the URL parameters:
 * 	- `token`   The preview token to authenticate future preview requests
 * 						  Crucially, this is _different_ from the session token obtained above
 *  - `suffix`  (optional) The pathname + search to hit on the preview worker once redirected
 *
 * It must be called with a random subdomain
 * to provide cookie isolation for the preview.
 *
 * It will redirect to the suffix provide, setting a cookie with the `token`
 * for future use.
 */
app.get(`${previewDomain}/.update-preview-token`, (c) => {
	const url = new URL(c.req.url);
	const token = url.searchParams.get("token");
	if (!token) {
		throw new TokenUpdateFailed();
	}
	setCookie(c, "token", token, {
		secure: true,
		sameSite: "None",
		httpOnly: true,
		domain: url.hostname,
	});

	return c.redirect(url.searchParams.get("suffix") ?? "/", 307);
});

app.all(`${previewDomain}/*`, async (c) => {
	if (c.req.method === "OPTIONS") {
		return new Response(null, {
			headers: {
				"Access-Control-Allow-Origin": c.req.headers.get("Origin") ?? "",
				"Access-Control-Allow-Method": "*",
				"Access-Control-Allow-Credentials": "true",
				"Access-Control-Allow-Headers":
					c.req.headers.get("Access-Control-Request-Headers") ?? "x-cf-token",
				"Access-Control-Expose-Headers": "*",
				Vary: "Origin, Access-Control-Request-Headers",
			},
		});
	}
	const url = new URL(c.req.url);
	if (c.req.headers.has("cf-raw-http")) {
		return handleRawHttp(c.req.raw, url, c.env);
	}
	const token = getCookie(c, "token");

	if (!token) {
		throw new PreviewRequestFailed(token, false);
	}

	const userObject = c.env.UserSession.get(
		c.env.UserSession.idFromString(token)
	);

	const original = await userObject.fetch(
		url,
		new Request(c.req.raw, {
			headers: {
				...Object.fromEntries(c.req.headers),
				"cf-run-user-worker": "true",
			},
			redirect: "manual",
		})
	);
	const embeddable = new Response(original.body, original);
	// This will be embedded in an iframe. In particular, the Cloudflare error page sets this header.
	embeddable.headers.delete("X-Frame-Options");
	return embeddable;
});

app.all(`${rootDomain}/*`, (c) => fetch(c.req.raw));

app.onError((e, c) => {
	console.log("ONERROR");
	const sentry = c.get("sentry");
	return handleException(e, sentry);
});

export default <ExportedHandler>{
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		return app.fetch(request, env, ctx);
	},
};

export { UserSession } from "./user.do";
