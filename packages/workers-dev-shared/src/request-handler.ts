import { createHeaders, sendResponse } from "@remix-run/node-fetch-server";
import {
	CoreHeaders,
	parseForwardedProto,
	Request as MiniflareRequest,
	Response as MiniflareResponse,
} from "miniflare";
import { PROXY_SHARED_SECRET } from "./constants";
import type * as http from "node:http";

/** A Node.js request as passed to Connect-style middleware. */
export type IncomingMessage = http.IncomingMessage & { originalUrl?: string };

/** The `next` callback passed to Connect-style middleware. */
export type NextFunction = (error?: unknown) => void;

/**
 * Creates Connect-style middleware that converts the incoming Node.js request
 * to a Miniflare request, passes it to `handler`, and writes back the response.
 *
 * @param handler Dispatches the request (usually to Miniflare)
 * @param options.onResponse Called with each response before it is sent
 * @returns The middleware
 */
export function createRequestHandler(
	handler: (
		request: MiniflareRequest,
		req: IncomingMessage
	) => Promise<MiniflareResponse>,
	options: { onResponse?: (response: MiniflareResponse) => void } = {}
): (
	req: IncomingMessage,
	res: http.ServerResponse,
	next: NextFunction
) => Promise<void> {
	return async (req, res, next) => {
		let request: Request | undefined;

		try {
			// Built in vite middleware trims out the base path when passing in the request
			// We can restore it by using the `originalUrl` property
			// This makes sure the worker receives the correct url in both dev using vite and production
			if (req.originalUrl) {
				req.url = req.originalUrl;
			}
			// Honor the `X-Forwarded-Proto` header on the incoming request so that
			// `request.url` reflects the protocol the original client used, not the
			// HTTP connection between the proxy and the dev server. This is needed
			// when the dev server sits behind a TLS-terminating reverse proxy
			// or tunnel (cloudflared, ngrok, etc.) so that frameworks performing
			// Origin/Host checks (e.g. CSRF protection) see a consistent origin.
			//
			// We trust this unconditionally because the dev server is a
			// local-only dev tool and this header is the de-facto standard set by
			// reverse proxies. Browser-mediated CSRF attacks cannot reach here:
			// `X-Forwarded-Proto` is not a CORS-safelisted header, so a `fetch()`
			// that sets it triggers a CORS preflight, and simple form-submitted
			// POSTs cannot include custom headers at all.
			//
			// If the header is absent or invalid, `createRequest` falls back to the
			// connection protocol (`req.socket.encrypted`).
			const protocol = getForwardedProto(req);
			request = createRequestForIncomingMessage(
				req,
				res,
				protocol ? { protocol } : undefined
			);

			let response = await handler(toMiniflareRequest(request), req);

			// Vite uses HTTP/2 when `server.https` or `preview.https` is enabled
			if (req.httpVersionMajor === 2) {
				response = new MiniflareResponse(response.body, response);
				// HTTP/2 disallows use of the `transfer-encoding` header
				response.headers.delete("transfer-encoding");
			}

			options.onResponse?.(response);

			await sendResponse(res, response as unknown as Response);
		} catch (error) {
			if (request?.signal.aborted) {
				// If the request was aborted, ignore the error
				return;
			}

			next(error);
		}
	};
}

export function createRequestForIncomingMessage(
	req: IncomingMessage,
	res: http.ServerResponse,
	options?: { protocol?: "http:" | "https:"; host?: string }
): Request {
	const controller = new AbortController();
	res.on("close", () => {
		controller.abort();
	});

	const method = req.method ?? "GET";
	const headers = createHeaders(req);
	const protocol =
		options?.protocol ??
		getScheme(req) ??
		("encrypted" in req.socket && req.socket.encrypted ? "https:" : "http:");
	const host =
		options?.host ?? getAuthority(req) ?? headers.get("Host") ?? "localhost";
	if (headers.get("Host") !== host) {
		headers.set("Host", host);
	}
	const url = new URL(req.url ?? "/", `${protocol}//${host}`);
	const init: RequestInit & { duplex?: "half" } = {
		method,
		headers,
		signal: controller.signal,
	};

	if (method !== "GET" && method !== "HEAD") {
		init.body = createCancellableRequestBody(req);
		init.duplex = "half";
	}

	return new Request(url, init);
}

function createCancellableRequestBody(
	req: IncomingMessage
): ReadableStream<Uint8Array> {
	let cleanup: (() => void) | undefined;

	return new ReadableStream<Uint8Array>({
		start(controller) {
			const onData = (chunk: Buffer) => {
				try {
					controller.enqueue(
						new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
					);
				} catch (error) {
					if (
						error instanceof TypeError &&
						error.message.includes("Controller is already closed")
					) {
						cleanup?.();
						req.resume();
						return;
					}
					throw error;
				}
			};
			const onEnd = () => {
				cleanup?.();
				controller.close();
			};
			const onError = (error: Error) => {
				cleanup?.();
				controller.error(error);
			};

			cleanup = () => {
				req.off("data", onData);
				req.off("end", onEnd);
				req.off("error", onError);
				cleanup = undefined;
			};

			req.on("data", onData);
			req.on("end", onEnd);
			req.on("error", onError);
		},
		cancel() {
			cleanup?.();
			req.resume();
		},
	});
}

export function toMiniflareRequest(request: Request): MiniflareRequest {
	const host = request.headers.get("Host") ?? new URL(request.url).host;
	const xForwardedHost = request.headers.get("X-Forwarded-Host");

	if (host && !xForwardedHost) {
		// Set the `x-forwarded-host` header to the host of the dev server if it is not already set
		// Note that the `host` header inside the Worker will contain the workerd host
		// TODO: reconsider this when adopting `miniflare.dispatchFetch` as it may be possible to provide the dev server host in the `host` header
		request.headers.set("X-Forwarded-Host", host);
	}

	// Add the proxy shared secret to the request headers
	// so the proxy worker can trust it and add host headers back
	request.headers.set(CoreHeaders.PROXY_SHARED_SECRET, PROXY_SHARED_SECRET);

	// Undici sets the `Sec-Fetch-Mode` header to `cors` so we capture it in a custom header to be converted back later.
	const secFetchMode = request.headers.get("Sec-Fetch-Mode");
	if (secFetchMode) {
		request.headers.set(CoreHeaders.SEC_FETCH_MODE, secFetchMode);
	}
	return new MiniflareRequest(request.url, {
		method: request.method,
		headers: [["accept-encoding", "identity"], ...request.headers],
		body: request.body,
		duplex: "half",
		signal: request.signal,
	});
}

/**
 * Parses the `X-Forwarded-Proto` header from an incoming Node.js request.
 *
 * If multiple proxies are in the chain, the header may be a comma-separated
 * list — the left-most value is the original client-facing protocol.
 * Returns `undefined` if the header is missing or holds an unsupported value.
 */
export function getForwardedProto(req: {
	headers: http.IncomingHttpHeaders;
}): "http:" | "https:" | undefined {
	const raw = req.headers["x-forwarded-proto"];
	return parseForwardedProto(Array.isArray(raw) ? raw[0] : raw);
}

/**
 * Extracts the authority (host and port) from an incoming Node.js request.
 *
 * In HTTP/2, browsers pass the host and port in the `:authority` pseudo-header
 * rather than the HTTP/1.1 `Host` header. This helper inspects `:authority`
 * (or the `authority` property on `http2.Http2ServerRequest`) so that ports
 * are preserved when converting Node requests to standard Fetch requests.
 *
 * @param req Incoming request containing HTTP headers and optional authority property
 * @returns The authority string (e.g. "localhost:5173"), or undefined if not present
 */
export function getAuthority(req: {
	headers: http.IncomingHttpHeaders;
	authority?: string;
}): string | undefined {
	const raw = req.headers[":authority"];
	const value = Array.isArray(raw) ? raw[0] : raw;
	if (value) {
		return value;
	}
	if (typeof req.authority === "string" && req.authority) {
		return req.authority;
	}
	return undefined;
}

/**
 * Extracts the scheme from an incoming Node.js request.
 *
 * Checks the `:scheme` pseudo-header in HTTP/2 requests or the `scheme`
 * property on `http2.Http2ServerRequest`.
 *
 * @param req Incoming request containing HTTP headers and optional scheme property
 * @returns The normalized scheme ("http:" or "https:"), or undefined if not present or unsupported
 */
export function getScheme(req: {
	headers: http.IncomingHttpHeaders;
	scheme?: string;
}): "http:" | "https:" | undefined {
	const raw = req.headers[":scheme"];
	const value = Array.isArray(raw) ? raw[0] : raw;
	if (value) {
		const lower = value.toLowerCase();
		if (lower === "http" || lower === "https") {
			return `${lower}:`;
		}
	}
	if (typeof req.scheme === "string" && req.scheme) {
		const lower = req.scheme.toLowerCase();
		if (lower === "http" || lower === "https") {
			return `${lower}:`;
		}
	}
	return undefined;
}
