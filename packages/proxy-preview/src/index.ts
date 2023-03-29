import cookie from "cookie";
import { Toucan } from "toucan-js";

export interface Env {
	SENTRY_DSN: string;
}

class HttpError extends Error {
	constructor(message: string, readonly status: number) {
		super(message);
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
}

class NoExchangeUrl extends HttpError {}
class ExchangeFailed extends HttpError {}
class TokenUpdateFailed extends HttpError {}
class RawHttpFailed extends HttpError {}
class PreviewRequestFailed extends HttpError {}

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
		});
		try {
			const url = new URL(request.url);

			/**
			 * Request the preview session associated with a given exchange_url
			 * exchange_url comes from an authenticated core API call made in the client
			 * It doesn't have CORs set up, so needs to be proxied
			 */
			if (
				request.method === "POST" &&
				url.hostname === "preview.devprod.cloudflare.dev" &&
				url.pathname === "/exchange"
			) {
				const exchangeUrl = url.searchParams.get("exchange_url");
				if (!exchangeUrl) {
					throw new NoExchangeUrl("No exchange_url provided", 400);
				}
				const exchangeRes = await fetch(exchangeUrl);
				if (exchangeRes.status !== 200) {
					const exchange = new URL(exchangeUrl);
					// Clear sensitive token
					exchange.search = "";
					console.error(
						"Failed Exchange",
						exchange.href,
						exchangeRes.status,
						await exchangeRes.text()
					);
					throw new ExchangeFailed("Exchange failed", 400);
				}
				const session = (await exchangeRes.json()) as {
					prewarm: string;
					token: string;
				};
				if (
					typeof session.token !== "string" ||
					typeof session.prewarm !== "string"
				) {
					const exchange = new URL(exchangeUrl);
					// Clear sensitive token
					exchange.search = "";
					console.error(
						"Invalid exchange response",
						exchange.href,
						exchangeRes.status,
						session
					);
					throw new ExchangeFailed("Exchange failed", 400);
				}
				return Response.json(session, {
					headers: {
						"Access-Control-Allow-Origin": "*",
						"Access-Control-Allow-Method": "POST",
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
			if (
				request.method === "GET" &&
				url.hostname.endsWith("preview.devprod.cloudflare.dev") &&
				url.pathname === "/.update-preview-token"
			) {
				const token = url.searchParams.get("token");
				const prewarmUrl = url.searchParams.get("prewarm");
				const remote = url.searchParams.get("remote");
				if (!token || !prewarmUrl || !remote) {
					throw new TokenUpdateFailed(
						"Provide token, prewarmUrl and remote",
						400
					);
				}
				if (prewarmUrl && token) {
					ctx.waitUntil(
						// @ts-expect-error toucan-js is affecting types. TODO: investigate
						fetch(prewarmUrl, {
							method: "POST",
							headers: {
								"cf-workers-preview-token": token,
							},
						})
					);
				}
				return new Response(null, {
					status: 307,
					headers: {
						Location: url.searchParams.get("suffix") ?? "/",
						"Set-Cookie": cookie.serialize(
							"token",
							JSON.stringify({ token, remote }),
							{
								secure: true,
								httpOnly: true,
								domain: url.hostname,
							}
						),
					},
				});
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
			if (url.hostname.endsWith("rawhttp.devprod.cloudflare.dev")) {
				if (request.method === "OPTIONS") {
					return new Response(null, {
						headers: {
							"Access-Control-Allow-Origin":
								request.headers.get("Origin") ?? "",
							"Access-Control-Allow-Method": "*",
							"Access-Control-Allow-Credentials": "true",
							"Access-Control-Allow-Headers": "x-cf-token,x-cf-remote",
							"Access-Control-Expose-Headers": "*",
							Vary: "Origin",
						},
					});
				}
				let token = request.headers.get("X-CF-Token");
				let remote = request.headers.get("X-CF-Remote");
				if (!token || !remote) {
					throw new RawHttpFailed("Provide token, and remote", 400);
				}
				const workerUrl = new URL(url);
				const remoteUrl = new URL(remote);
				workerUrl.hostname = remoteUrl.hostname;
				workerUrl.protocol = remoteUrl.protocol;
				// @ts-expect-error toucan-js is affecting types. TODO: investigate
				const workerResponse = await fetch(workerUrl, {
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
			 * Finally, if no other conditions are met, make a preview request to the worker
			 * This must be called with the same subdomain as used in /.update-preview-token
			 * so that the cookie will be present. It will swap the host and inject the preview token
			 * but otherwise will pass the request through unchanged
			 */
			const parsedCookies = cookie.parse(request.headers.get("Cookie") ?? "");
			const { token, remote } = JSON.parse(parsedCookies?.token ?? "{}");
			if (!token || !remote) {
				throw new PreviewRequestFailed("Provide token, and remote", 400);
			}

			const workerUrl = new URL(url);
			const remoteUrl = new URL(remote!);
			workerUrl.hostname = remoteUrl.hostname;
			workerUrl.protocol = remoteUrl.protocol;
			// @ts-expect-error toucan-js is affecting types. TODO: investigate
			return fetch(workerUrl, {
				...request,
				headers: {
					...request.headers,
					"cf-workers-preview-token": token,
				},
			});
		} catch (e) {
			sentry.captureException(e);
			if (e instanceof HttpError) {
				return e.toResponse();
			} else {
				console.error(e);
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
