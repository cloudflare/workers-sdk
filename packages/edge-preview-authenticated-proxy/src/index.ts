import cookie from "cookie";
import prom from "promjs";
import { Toucan } from "toucan-js";

class HttpError extends Error {
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

class NoExchangeUrl extends HttpError {
	constructor() {
		super("No exchange_url provided", 400, false);
	}
}

class ExchangeFailed extends HttpError {
	constructor(
		readonly url: string,
		readonly exchangeStatus: number,
		readonly body: string
	) {
		super("Exchange failed", 400, true);
	}

	get data(): { url: string; status: number; body: string } {
		return { url: this.url, status: this.exchangeStatus, body: this.body };
	}
}

class TokenUpdateFailed extends HttpError {
	constructor() {
		super("Provide token, prewarmUrl and remote", 400, false);
	}
}

class RawHttpFailed extends HttpError {
	constructor() {
		super("Provide token, and remote", 400, false);
	}
}

class PreviewRequestFailed extends HttpError {
	constructor(
		private tokenId: string,
		reportable: boolean
	) {
		super("Token and remote not found", 400, reportable);
	}
	get data(): { tokenId: string } {
		return { tokenId: this.tokenId };
	}
}

class InvalidURL extends HttpError {
	constructor(private readonly url: string) {
		super("Invalid URL", 400, false);
	}
	get data() {
		return { url: this.url };
	}
}

function assertValidURL(maybeUrl: string) {
	if (!URL.canParse(maybeUrl)) {
		throw new InvalidURL(maybeUrl);
	}
}

function switchRemote(url: URL, remote: string) {
	const workerUrl = new URL(url);
	const remoteUrl = new URL(remote);
	workerUrl.hostname = remoteUrl.hostname;
	workerUrl.protocol = remoteUrl.protocol;
	workerUrl.port = remoteUrl.port;
	return workerUrl;
}

function isTokenExchangeRequest(request: Request, url: URL, env: Env) {
	return (
		request.method === "POST" &&
		url.hostname === env.PREVIEW &&
		url.pathname === "/exchange"
	);
}

function isPreviewUpdateRequest(request: Request, url: URL, env: Env) {
	return (
		request.method === "GET" &&
		url.hostname.endsWith(env.PREVIEW) &&
		url.pathname === "/.update-preview-token"
	);
}

function isRawHttpRequest(url: URL, env: Env) {
	return url.hostname.endsWith(env.RAW_HTTP);
}

async function handleRequest(
	request: Request,
	env: Env,
	ctx: ExecutionContext
) {
	const url = new URL(request.url);

	if (isTokenExchangeRequest(request, url, env)) {
		return handleTokenExchange(url);
	}

	if (isPreviewUpdateRequest(request, url, env)) {
		return updatePreviewToken(url, env, ctx);
	}

	if (isRawHttpRequest(url, env)) {
		return handleRawHttp(request, url);
	}

	/**
	 * Finally, if no other conditions are met, make a preview request to the worker
	 * This must be called with the same subdomain as used in /.update-preview-token
	 * so that the cookie will be present. It will swap the host and inject the preview token
	 * but otherwise will pass the request through unchanged
	 */
	const parsedCookies = cookie.parse(request.headers.get("Cookie") ?? "");

	const tokenId = parsedCookies?.token;

	const { token, remote } = JSON.parse(
		(await env.TOKEN_LOOKUP.get(tokenId)) ?? "{}"
	);
	if (!token || !remote) {
		// Report this error if a tokenId was provided
		throw new PreviewRequestFailed(tokenId, !!tokenId);
	}

	const original = await fetch(
		switchRemote(url, remote),
		new Request(request, {
			headers: {
				...Object.fromEntries(request.headers),
				"cf-workers-preview-token": token,
			},
			redirect: "manual",
		})
	);
	const embeddable = new Response(original.body, original);
	// This will be embedded in an iframe. In particular, the Cloudflare error page sets this header.
	embeddable.headers.delete("X-Frame-Options");
	return embeddable;
}

/**
 * Given a preview token, this endpoint allows for raw http calls to be inspected
 * It must be called with a random subdomain (i.e. some-random-data.rawhttp.devprod.cloudflare.dev)
 * for consistency with the preview endpoint. This is not currently used, but may be in future
 *
 * It requires two parameters, passed as headers:
 *  - `X-CF-Token`  A preview token, as in /.update-preview-token
 *  - `X-CF-Remote` Which endpoint to hit with preview requests, as in /.update-preview-token
 */
async function handleRawHttp(request: Request, url: URL) {
	if (request.method === "OPTIONS") {
		return new Response(null, {
			headers: {
				"Access-Control-Allow-Origin": request.headers.get("Origin") ?? "",
				"Access-Control-Allow-Methods": "*",
				"Access-Control-Allow-Credentials": "true",
				"Access-Control-Allow-Headers":
					request.headers.get("Access-Control-Request-Headers") ??
					"x-cf-token,x-cf-remote",
				"Access-Control-Expose-Headers": "*",
				Vary: "Origin, Access-Control-Request-Headers",
			},
		});
	}

	const requestHeaders = new Headers(request.headers);

	const token = requestHeaders.get("X-CF-Token");
	const remote = requestHeaders.get("X-CF-Remote");

	// Fallback to the request method for backward compatibility
	const method = requestHeaders.get("X-CF-Http-Method") ?? request.method;

	if (!token || !remote) {
		throw new RawHttpFailed();
	}

	// Reassign the token to a different header
	requestHeaders.set("cf-workers-preview-token", token);

	// Delete these consumed headers so as not to bloat the request.
	// Some tokens can be quite large and may cause nginx to reject the
	// request due to exceeding size limits if the value is included twice.
	requestHeaders.delete("X-CF-Token");
	requestHeaders.delete("X-CF-Remote");
	requestHeaders.delete("X-CF-Http-Method");

	const headerEntries = [...requestHeaders.entries()];

	for (const header of headerEntries) {
		if (header[0].startsWith("cf-ew-raw-")) {
			requestHeaders.set(header[0].split("cf-ew-raw-")[1], header[1]);
			requestHeaders.delete(header[0]);
		}
	}

	const workerResponse = await fetch(switchRemote(url, remote), {
		method,
		headers: requestHeaders,
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

	// Pass the raw content type back so that clients can decode the body correctly
	const contentType = responseHeaders.get("Content-Type");
	if (contentType) {
		rawHeaders.set("Content-Type", contentType);
	}
	const contentEncoding = responseHeaders.get("Content-Encoding");
	if (contentEncoding) {
		rawHeaders.set("Content-Encoding", contentEncoding);
	}
	const transferEncoding = responseHeaders.get("Transfer-Encoding");
	if (transferEncoding) {
		rawHeaders.set("Transfer-Encoding", transferEncoding);
	}

	// The client needs the raw headers from the worker
	// Prefix them with `cf-ew-raw-`, so that response headers from _this_ worker don't interfere
	const setCookieHeader = responseHeaders.getSetCookie();
	for (const setCookie of setCookieHeader) {
		rawHeaders.append("cf-ew-raw-set-cookie", setCookie);
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

/**
 * Given a preview session, the client should obtain a specific preview token
 * This endpoint takes in the URL parameters:
 * 	- `token`   The preview token to authenticate future preview requests
 * 						  Crucially, this is _different_ from the session token obtained above
 *  - `remote`  Which endpoint to hit with preview requests
 *              This should be the workers.dev deployment for the current worker
 *  - `prewarm` A fire-and-forget prewarm endpoint to hit to start up the preview
 *  - `suffix`  (optional) The pathname + search to hit on the preview worker once redirected
 *
 * It must be called with a random subdomain (i.e. some-random-data.preview.devprod.cloudflare.dev)
 * to provide cookie isolation for the preview.
 *
 * It will redirect to the suffix provide, setting a cookie with the `token` and `remote`
 * for future use.
 */
async function updatePreviewToken(url: URL, env: Env, ctx: ExecutionContext) {
	const token = url.searchParams.get("token");
	const prewarmUrl = url.searchParams.get("prewarm");
	const remote = url.searchParams.get("remote");
	// return Response.json([...url.searchParams.entries()]);
	if (!token || !prewarmUrl || !remote) {
		throw new TokenUpdateFailed();
	}

	assertValidURL(prewarmUrl);
	assertValidURL(remote);

	ctx.waitUntil(
		fetch(prewarmUrl, {
			method: "POST",
			headers: {
				"cf-workers-preview-token": token,
			},
		})
	);

	// The token can sometimes be too large for a cookie (4096 bytes).
	// Store the token in KV, and allow lookups

	const tokenId = crypto.randomUUID();

	await env.TOKEN_LOOKUP.put(tokenId, JSON.stringify({ token, remote }), {
		// A preview token should only be valid for an hour.
		// Store it for 2 just in case
		expirationTtl: 60 * 60 * 2,
	});

	return new Response(null, {
		status: 307,
		headers: {
			Location: url.searchParams.get("suffix") ?? "/",
			"Set-Cookie": cookie.serialize("token", tokenId, {
				secure: true,
				sameSite: "none",
				httpOnly: true,
				domain: url.hostname,
				partitioned: true,
			}),
		},
	});
}

/**
 * Request the preview session associated with a given exchange_url
 * exchange_url comes from an authenticated core API call made in the client
 * It doesn't have CORS set up, so needs to be proxied
 */
async function handleTokenExchange(url: URL) {
	const exchangeUrl = url.searchParams.get("exchange_url");
	if (!exchangeUrl) {
		throw new NoExchangeUrl();
	}
	assertValidURL(exchangeUrl);
	const exchangeRes = await fetch(exchangeUrl);
	if (exchangeRes.status !== 200) {
		const exchange = new URL(exchangeUrl);
		// Clear sensitive token
		exchange.search = "";

		throw new ExchangeFailed(
			exchange.href,
			exchangeRes.status,
			await exchangeRes.text()
		);
	}
	const session = await exchangeRes.json<{
		prewarm: string;
		token: string;
	}>();
	if (
		typeof session.token !== "string" ||
		typeof session.prewarm !== "string"
	) {
		const exchange = new URL(exchangeUrl);
		// Clear sensitive token
		exchange.search = "";
		throw new ExchangeFailed(
			exchange.href,
			exchangeRes.status,
			JSON.stringify(session)
		);
	}
	return Response.json(session, {
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "POST",
		},
	});
}

// No ecosystem routers support hostname matching 😥
export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const registry = prom();
		const requestCounter = registry.create(
			"counter",
			"devprod_edge_preview_authenticated_proxy_request_total",
			"Request counter for DevProd's edge-preview-authenticated-proxy service"
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

		try {
			return await handleRequest(request, env, ctx);
		} catch (e) {
			console.error(e);
			if (e instanceof HttpError) {
				if (e.reportable) {
					sentry.setContext("Details", e.data);
					sentry.captureException(e);
				}
				return e.toResponse();
			} else {
				sentry.captureException(e);
				const errorCounter = registry.create(
					"counter",
					"devprod_edge_preview_authenticated_proxy_error_total",
					"Error counter for DevProd's edge-preview-authenticated-proxy service"
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
			}
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
