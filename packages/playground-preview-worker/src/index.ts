import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import prom from "promjs";
import {
	HttpError,
	PreviewRequestFailed,
	PreviewRequestForbidden,
	RawHttpFailed,
	TokenUpdateFailed,
	UploadFailed,
} from "./errors";
import { handleException, setupSentry } from "./sentry";
import type { RegistryType } from "promjs";
import type { Toucan } from "toucan-js";

function maybeParseUrl(url: string | undefined) {
	if (!url) {
		return undefined;
	}
	try {
		return new URL(url);
	} catch {
		return undefined;
	}
}

const app = new Hono<{
	Bindings: Env;
	Variables: { sentry: Toucan; prometheus: RegistryType };
}>({
	// This replaces . with / in url hostnames, which allows for parameter matching in hostnames as well as paths
	// e.g. https://something.example.com/hello/world -> something/example/com/hello/world
	getPath: (req) => {
		const url = new URL(req.url);
		return url.hostname.replaceAll(".", "/") + url.pathname;
	},
});

const rootDomain = ROOT;
const previewDomain = PREVIEW;

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
	let userObjectId: DurableObjectId;
	try {
		userObjectId = env.UserSession.idFromString(token);
	} catch {
		throw new RawHttpFailed();
	}
	const userObject = env.UserSession.get(userObjectId);

	// Delete these consumed headers so as not to bloat the request.
	// Some tokens can be quite large and may cause nginx to reject the
	// request due to exceeding size limits if the value is included twice.

	const headers = new Headers(request.headers);

	// Fallback to the request method for backward compatibility
	const method = request.headers.get("X-CF-Http-Method") ?? request.method;

	headers.delete("X-CF-Http-Method");
	headers.delete("X-CF-Token");

	const headerEntries = [...headers.entries()];

	for (const header of headerEntries) {
		if (header[0].startsWith("cf-ew-raw-")) {
			headers.set(header[0].split("cf-ew-raw-")[1], header[1]);
			headers.delete(header[0]);
		}
	}

	headers.append("cf-run-user-worker", "true");

	const workerResponse = await userObject.fetch(url, {
		method,
		headers,
		body: method === "GET" || method === "HEAD" ? null : request.body,
		redirect: "manual",
	});

	const responseHeaders = new Headers(workerResponse.headers);

	const rawHeaders = new Headers({
		"Access-Control-Allow-Origin": request.headers.get("Origin") ?? "",
		"Access-Control-Allow-Methods": "*",
		"Access-Control-Allow-Credentials": "true",
		"cf-ew-status": workerResponse.status.toString(),
		"Access-Control-Expose-Headers": "*",
		Vary: "Origin",
	});

	// The client needs the raw headers from the worker
	// Prefix them with `cf-ew-raw-`, so that response headers from _this_ worker don't interfere
	const setCookieHeader = responseHeaders.getSetCookie();
	for (const cookie of setCookieHeader) {
		rawHeaders.append("cf-ew-raw-set-cookie", cookie);
	}
	responseHeaders.delete("Set-Cookie");
	for (const header of responseHeaders.entries()) {
		rawHeaders.set(`cf-ew-raw-${header[0]}`, header[1]);
	}

	return new Response(workerResponse.body, {
		...workerResponse,
		headers: rawHeaders,
	});
}

app.use("*", async (c, next) => {
	c.set("prometheus", prom());

	const registry = c.get("prometheus");
	const requestCounter = registry.create(
		"counter",
		"devprod_playground_preview_worker_request_total",
		"Request counter for DevProd's playground-preview-worker service"
	);
	requestCounter.inc();

	try {
		return await next();
	} finally {
		c.executionCtx.waitUntil(
			fetch("https://workers-logging.cfdata.org/prometheus", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${c.env.PROMETHEUS_TOKEN}`,
				},
				body: registry.metrics(),
			})
		);
	}
});

app.use("*", async (c, next) => {
	c.set(
		"sentry",
		setupSentry(
			c.req.raw,
			c.executionCtx as ExecutionContext, // TODO: fix hono's types?
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
	if (setCookieHeader !== null) {
		mutable.headers.set("Set-Cookie", setCookieHeader);
	}

	return mutable;
});

app.post(`${rootDomain}/api/worker`, async (c) => {
	const userId = getCookie(c, "user");
	if (!userId) {
		throw new UploadFailed();
	}
	let userObjectId: DurableObjectId;
	try {
		userObjectId = c.env.UserSession.idFromString(userId);
	} catch {
		throw new UploadFailed();
	}
	const userObject = c.env.UserSession.get(userObjectId);

	return userObject.fetch("https://example.com", {
		body: c.req.raw.body,
		method: "POST",
		headers: c.req.raw.headers,
	});
});

app.get(`${rootDomain}/api/inspector`, async (c) => {
	const url = new URL(c.req.url);
	const userId = url.searchParams.get("user");
	if (!userId) {
		throw new PreviewRequestFailed("", false);
	}
	let userObjectId: DurableObjectId;
	try {
		userObjectId = c.env.UserSession.idFromString(userId);
	} catch {
		throw new PreviewRequestFailed(userId, false);
	}
	const userObject = c.env.UserSession.get(userObjectId);

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
	const referer = maybeParseUrl(c.req.header("Referer"));

	if (
		!referer ||
		c.req.header("Sec-Fetch-Dest") !== "iframe" ||
		!(
			referer.hostname === "workers.cloudflare.com" ||
			referer.hostname === "localhost" ||
			referer.hostname.endsWith("workers-playground.pages.dev")
		)
	) {
		throw new PreviewRequestForbidden();
	}

	if (!token) {
		throw new TokenUpdateFailed();
	}
	// Validate `token` is an actual Durable Object ID
	try {
		c.env.UserSession.idFromString(token);
	} catch {
		throw new TokenUpdateFailed();
	}

	setCookie(c, "token", token, {
		secure: true,
		sameSite: "None",
		httpOnly: true,
		domain: url.hostname,
		partitioned: true,
	});

	return c.redirect(url.searchParams.get("suffix") ?? "/", 307);
});

app.all(`${previewDomain}/*`, async (c) => {
	if (c.req.method === "OPTIONS") {
		return new Response(null, {
			headers: {
				"Access-Control-Allow-Origin": c.req.raw.headers.get("Origin") ?? "",
				"Access-Control-Allow-Methods": "*",
				"Access-Control-Allow-Credentials": "true",
				"Access-Control-Allow-Headers":
					c.req.raw.headers.get("Access-Control-Request-Headers") ??
					"x-cf-token",
				"Access-Control-Expose-Headers": "*",
				Vary: "Origin, Access-Control-Request-Headers",
			},
		});
	}
	const url = new URL(c.req.url);
	if (c.req.raw.headers.has("cf-raw-http")) {
		return handleRawHttp(c.req.raw, url, c.env);
	}
	const token = getCookie(c, "token");
	if (!token) {
		throw new PreviewRequestFailed(token, false);
	}
	let userObjectId: DurableObjectId;
	try {
		userObjectId = c.env.UserSession.idFromString(token);
	} catch {
		throw new PreviewRequestFailed(token, false);
	}
	const userObject = c.env.UserSession.get(userObjectId);

	const original = await userObject.fetch(
		url,
		new Request(c.req.raw, {
			headers: {
				...Object.fromEntries(c.req.raw.headers),
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
	const registry = c.get("prometheus");

	// Only include reportable `HttpError`s or any other error in error metrics
	if (!(e instanceof HttpError) || e.reportable) {
		const errorCounter = registry.create(
			"counter",
			"devprod_playground_preview_worker_error_total",
			"Error counter for DevProd's playground-preview-worker service"
		);
		errorCounter.inc();
	}

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
