import cookie from "cookie";
import { Toucan } from "toucan-js";

class HttpError extends Error {
	constructor(message: string, readonly status: number) {
		super(message);
		Object.setPrototypeOf(this, new.target.prototype);
	}
	toResponse() {
		return Response.json(
			{
				error: this.name,
				message: this.message,
			},
			{ status: this.status }
		);
	}

	get data(): Record<string, unknown> {
		return {};
	}
}

class NoExchangeUrl extends HttpError {
	constructor() {
		super("No exchange_url provided", 400);
	}
}

class ExchangeFailed extends HttpError {
	constructor(
		readonly url: string,
		readonly exchangeStatus: number,
		readonly body: string
	) {
		super("Exchange failed", 400);
	}

	get data(): { url: string; status: number; body: string } {
		return { url: this.url, status: this.exchangeStatus, body: this.body };
	}
}

class TokenUpdateFailed extends HttpError {
	constructor() {
		super("Provide token, prewarmUrl and remote", 400);
	}
}

class RawHttpFailed extends HttpError {
	constructor() {
		super("Provide token, and remote", 400);
	}
}

class PreviewRequestFailed extends HttpError {
	constructor() {
		super("Provide token, and remote", 400);
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
		return updatePreviewToken(url, ctx);
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
	const { token, remote } = JSON.parse(parsedCookies?.token ?? "{}");
	if (!token || !remote) {
		throw new PreviewRequestFailed();
	}

	const original = await fetch(switchRemote(url, remote), {
		...request,
		headers: {
			...request.headers,
			"cf-workers-preview-token": token,
		},
	});
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
 * It required two parameters, passed as headers:
 *  - `X-CF-Token`  A preview token, as in /.update-preview-token
 *  - `X-CF-Remote` Which endpoint to hit with preview requests, as in /.update-preview-token
 */
async function handleRawHttp(request: Request, url: URL) {
	if (request.method === "OPTIONS") {
		return new Response(null, {
			headers: {
				"Access-Control-Allow-Origin": request.headers.get("Origin") ?? "",
				"Access-Control-Allow-Method": "*",
				"Access-Control-Allow-Credentials": "true",
				"Access-Control-Allow-Headers": "x-cf-token,x-cf-remote",
				"Access-Control-Expose-Headers": "*",
				Vary: "Origin",
			},
		});
	}
	const token = request.headers.get("X-CF-Token");
	const remote = request.headers.get("X-CF-Remote");
	if (!token || !remote) {
		throw new RawHttpFailed();
	}

	const workerResponse = await fetch(switchRemote(url, remote), {
		...request,
		headers: {
			...request.headers,
			"cf-workers-preview-token": token,
		},
	});
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
			"Access-Control-Allow-Headers": "x-cf-token,x-cf-remote",
			"cf-ew-status": workerResponse.status.toString(),
			"Access-Control-Expose-Headers": "*",
			Vary: "Origin",
		},
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
async function updatePreviewToken(url: URL, ctx: ExecutionContext) {
	const token = url.searchParams.get("token");
	const prewarmUrl = url.searchParams.get("prewarm");
	const remote = url.searchParams.get("remote");
	// return Response.json([...url.searchParams.entries()]);
	if (!token || !prewarmUrl || !remote) {
		throw new TokenUpdateFailed();
	}

	ctx.waitUntil(
		fetch(prewarmUrl, {
			method: "POST",
			headers: {
				"cf-workers-preview-token": token,
			},
		})
	);

	return new Response(null, {
		status: 307,
		headers: {
			Location: url.searchParams.get("suffix") ?? "/",
			"Set-Cookie": cookie.serialize(
				"token",
				JSON.stringify({ token, remote }),
				{
					secure: true,
					sameSite: "none",
					httpOnly: true,
					domain: url.hostname,
				}
			),
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
			"Access-Control-Allow-Method": "POST",
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
				sentry.captureException(e, {
					data: { ...e.data },
				});
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
	},
};
