import assert from "node:assert";
import http from "node:http";
import { Readable } from "node:stream";
import { IncomingRequestCfProperties } from "@cloudflare/workers-types/experimental";
import * as undici from "undici";
import { UndiciHeaders } from "undici/types/dispatcher";
import NodeWebSocket from "ws";
import { CoreHeaders, DeferredPromise } from "../workers";
import { Request, RequestInfo, RequestInit } from "./request";
import { Response } from "./response";
import { coupleWebSocket, WebSocketPair } from "./websocket";

const ignored = ["transfer-encoding", "connection", "keep-alive", "expect"];

export async function fetch(
	input: RequestInfo,
	init?: RequestInit | Request
): Promise<Response> {
	const requestInit = init as RequestInit;
	// If input is already a Request-like object and there's no extra init to
	// merge, use it directly rather than re-wrapping.  Re-wrapping can fail in
	// some environments (e.g. vitest forks with mixed ESM/CJS module graphs)
	// because undici's internal `webidl.is.Request` brand-check uses class
	// identity, and the test's ESM-resolved `Request` may be a different object
	// from the CJS-required `Request` inside this bundle.  Duck-typing on the
	// public `RequestInfo` interface avoids that brittleness.
	const isRequestLike =
		requestInit === undefined &&
		typeof input === "object" &&
		input !== null &&
		typeof (input as Request).url === "string" &&
		typeof (input as Request).method === "string" &&
		typeof (input as Request).headers === "object";
	const request = isRequestLike
		? (input as Request)
		: new Request(input, requestInit);

	// Handle WebSocket upgrades
	if (
		request.method === "GET" &&
		request.headers.get("upgrade") === "websocket"
	) {
		const url = new URL(request.url);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			throw new TypeError(
				`Fetch API cannot load: ${url.toString()}.\nMake sure you're using http(s):// URLs for WebSocket requests via fetch.`
			);
		}
		url.protocol = url.protocol.replace("http", "ws");

		// Normalise request headers to a format ws understands, extracting the
		// Sec-WebSocket-Protocol header as ws treats this differently
		const headers = new undici.Headers();
		let protocols: string[] | undefined;
		for (const [key, value] of request.headers.entries()) {
			if (key.toLowerCase() === "sec-websocket-protocol") {
				protocols = value.split(",").map((protocol) => protocol.trim());
			} else {
				headers.append(key, value);
			}
		}

		let rejectUnauthorized: { rejectUnauthorized: false } | undefined;
		if (requestInit.dispatcher instanceof DispatchFetchDispatcher) {
			requestInit.dispatcher.addHeaders(headers, url.pathname + url.search);
			rejectUnauthorized = { rejectUnauthorized: false };
		}

		// Establish web socket connection
		const ws = new NodeWebSocket(url, protocols, {
			followRedirects: request.redirect === "follow",
			headers: Object.fromEntries(headers.entries()),
			...rejectUnauthorized,
		});

		const responsePromise = new DeferredPromise<Response>();
		ws.once("upgrade", (req) => {
			const headers = convertUndiciHeadersToStandard(req.headers);
			// Couple web socket with pair and resolve
			const [worker, client] = Object.values(new WebSocketPair());
			const couplePromise = coupleWebSocket(ws, client);
			const response = new Response(null, {
				status: 101,
				webSocket: worker,
				headers,
			});
			responsePromise.resolve(couplePromise.then(() => response));
		});
		ws.once("unexpected-response", (_, req) => {
			const headers = convertUndiciHeadersToStandard(req.headers);
			const response = new Response(req, {
				status: req.statusCode,
				headers,
			});
			responsePromise.resolve(response);
		});
		return responsePromise;
	}

	// Wrap in a try/catch and re-throw as TypeError("fetch failed") to match
	// the error shape that undici.fetch() produces for dispatcher-level errors
	// (e.g. when the request contains an `upgrade` header that undici.request()
	// rejects with InvalidArgumentError).
	try {
		return await fetchViaRequest(request, requestInit?.dispatcher);
	} catch (e) {
		if (e instanceof TypeError) throw e;
		throw new TypeError("fetch failed", { cause: e });
	}
}

/**
 * Perform an HTTP request using `undici.request()` instead of `undici.fetch()`.
 *
 * `undici.fetch()` implements the Fetch spec's 401 credential-retry path, which
 * crashes with "expected non-null body source" when the request body is a
 * ReadableStream and the response status is 401. This is tracked upstream at
 * https://github.com/nodejs/undici/issues/4910.
 *
 * `undici.request()` uses the Dispatcher API directly and has no such path.
 * To maintain behavioural parity with `undici.fetch()` we explicitly handle:
 *   - Compression: send `Accept-Encoding: gzip, deflate` and decompress responses
 *   - Redirects: follow/manual/error modes as per the Fetch spec
 *   - `set-cookie`: preserve multiple values using `Headers.append()`
 */
async function fetchViaRequest(
	request: Request,
	dispatcher: undici.Dispatcher | undefined,
	redirectsRemaining = 20
): Promise<Response> {
	const { statusCode, headers: rawHeaders, body: rawBody } =
		await undici.request(request.url, {
			method: request.method,
				// Match undici.fetch() behaviour: add Accept-Encoding if the caller
			// has not already specified one, so that the workerd entry worker
			// applies the same content-encoding logic.
				// Match undici.fetch() defaults: it sends `Accept: */*` and
			// `Accept-Encoding: gzip, deflate` when the caller hasn't set them.
			// These are placed before the spread so the caller's own headers
			// take precedence.
			headers: {
				accept: "*/*",
				"accept-encoding": "gzip, deflate",
				...Object.fromEntries(request.headers),
			},
			// undici.request() accepts Node.js Readable streams but not web
			// ReadableStreams. Convert if necessary.
			body:
				request.body !== null
					? Readable.fromWeb(
							request.body as import("node:stream/web").ReadableStream
						)
					: null,
			dispatcher,
		});

	// Build a proper Headers object.  undici.request() returns headers as a plain
	// object where `set-cookie` may be an array.  Passing a plain object with an
	// array value to `new Response()` merges the values incorrectly, losing the
	// individual cookie boundaries.  Using `Headers.append()` preserves them.
	const headers = new undici.Headers();
	for (const [name, value] of Object.entries(rawHeaders)) {
		if (Array.isArray(value)) {
			for (const v of value) {
				headers.append(name, v);
			}
		} else if (value !== undefined) {
			headers.set(name, value);
		}
	}

	// Decompress response body to match undici.fetch() behaviour.  undici.fetch()
	// sends Accept-Encoding and transparently decompresses the response body while
	// leaving the Content-Encoding header in place.  We do the same here so that
	// callers (e.g. index.ts dispatchFetch) can apply the same Content-Encoding
	// stripping logic without receiving a still-compressed body.
	//
	// rawBody.body is the web ReadableStream exposed by undici's BodyReadable.
	const webStream = rawBody.body as ReadableStream | null | undefined;
	const contentEncoding = rawHeaders["content-encoding"];
	let responseBody: ReadableStream | null;
	if (
		(contentEncoding === "gzip" || contentEncoding === "x-gzip") &&
		webStream != null
	) {
		responseBody = webStream.pipeThrough(new DecompressionStream("gzip"));
	} else if (contentEncoding === "deflate" && webStream != null) {
		// Both zlib-wrapped deflate (the common HTTP interpretation) and raw deflate
		// are handled by DecompressionStream("deflate") in Node 18+.
		responseBody = webStream.pipeThrough(
			new DecompressionStream("deflate")
		);
	} else if (contentEncoding === "br" && webStream != null) {
		// "brotli" is not in the TypeScript CompressionFormat union yet, but
		// Node 22+ supports it via DecompressionStream.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		responseBody = webStream.pipeThrough(
			new DecompressionStream("brotli" as any)
		);
	} else {
		responseBody = webStream ?? null;
	}

	// Handle redirect modes, matching undici.fetch() behaviour.
	const redirectMode = request.redirect ?? "follow";
	const isRedirect =
		statusCode >= 300 &&
		statusCode < 400 &&
		rawHeaders["location"] !== undefined;

	if (isRedirect) {
		if (redirectMode === "error") {
			await rawBody.dump();
			throw new TypeError("fetch failed");
		}
		if (redirectMode === "manual") {
			return new Response(
				responseBody as AsyncIterable<Uint8Array> | null,
				{ status: statusCode, headers }
			);
		}
		// redirect === "follow"
		if (redirectsRemaining === 0) {
			await rawBody.dump();
			throw new TypeError("fetch failed");
		}
		const location = new URL(
			rawHeaders["location"] as string,
			request.url
		).toString();
		await rawBody.dump();
		// For 303 See Other: switch to GET and drop the body
		const redirectMethod = statusCode === 303 ? "GET" : request.method;
		const redirectBody = statusCode === 303 ? null : request.body;
		return fetchViaRequest(
			new Request(location, {
				method: redirectMethod,
				headers: request.headers,
				body: redirectBody,
				redirect: request.redirect,
			} as RequestInit),
			dispatcher,
			redirectsRemaining - 1
		);
	}

	// Responses with status 204/205 must have a null body (per spec).
	// Pass null explicitly to avoid "Invalid response status code" errors.
	const noBodyStatus = statusCode === 204 || statusCode === 205;
	// undici's BodyInit type doesn't list ReadableStream, but it does accept
	// AsyncIterable<Uint8Array> which ReadableStream satisfies at runtime.
	return new Response(
		noBodyStatus ? null : (responseBody as AsyncIterable<Uint8Array> | null),
		{ status: statusCode, headers }
	);
}

export type DispatchFetch = (
	input: RequestInfo,
	init?: RequestInit<Partial<IncomingRequestCfProperties>>
) => Promise<Response>;

export type AnyHeaders = http.IncomingHttpHeaders | string[];

function isIterable(
	headers: UndiciHeaders
): headers is Iterable<[string, string | string[] | undefined]> {
	return Symbol.iterator in Object(headers);
}

// See https://github.com/nodejs/undici/blob/main/docs/docs/api/Dispatcher.md?plain=1#L1151 for documentation
function convertUndiciHeadersToStandard(
	headers: NonNullable<UndiciHeaders>
): undici.Headers {
	// Array format: https://github.com/nodejs/undici/blob/main/docs/docs/api/Dispatcher.md?plain=1#L1157
	if (Array.isArray(headers)) {
		let name: string | undefined = undefined;
		let value: string | undefined = undefined;
		const standardHeaders = new undici.Headers();
		for (const element of headers) {
			if (name === undefined && value === undefined) {
				name = element;
			} else if (name !== undefined && value === undefined) {
				value = element;
			} else if (name !== undefined && value !== undefined) {
				if (!ignored.includes(name)) {
					standardHeaders.set(name, value);
				}
				name = undefined;
				value = undefined;
			}
		}
		// The string[] format for UndiciHeaders must have an even number of entries
		// https://github.com/nodejs/undici/blob/main/docs/docs/api/Dispatcher.md?plain=1#L1157
		assert(name === undefined && value === undefined);
		return standardHeaders;
	} else if (isIterable(headers)) {
		const standardHeaders = new undici.Headers();
		for (const [name, value] of headers) {
			if (!ignored.includes(name)) {
				if (!value) {
					continue;
				}
				if (typeof value === "string") {
					standardHeaders.append(name, value);
				} else {
					for (const v of value) {
						standardHeaders.append(name, v);
					}
				}
			}
		}
		return standardHeaders;
	} else {
		const standardHeaders = new undici.Headers();
		for (const [name, value] of Object.entries(headers)) {
			if (!ignored.includes(name)) {
				if (!value) {
					continue;
				}
				if (typeof value === "string") {
					standardHeaders.append(name, value);
				} else {
					for (const v of value) {
						standardHeaders.append(name, v);
					}
				}
			}
		}
		return standardHeaders;
	}
}

/**
 * Dispatcher created for each `dispatchFetch()` call. Ensures request origin
 * in Worker matches that passed to `dispatchFetch()`, not the address the
 * `workerd` server is listening on. Handles cases where `fetch()` redirects to
 * same origin and different external origins.
 */
export class DispatchFetchDispatcher extends undici.Dispatcher {
	private readonly cfBlobJson?: string;

	/**
	 * @param globalDispatcher 		Dispatcher to use for all non-runtime requests
	 * 												 		(rejects unauthorised certificates)
	 * @param runtimeDispatcher 	Dispatcher to use for runtime requests
	 * 														(permits unauthorised certificates)
	 * @param actualRuntimeOrigin	Origin to send all runtime requests to
	 * @param userRuntimeOrigin 	Origin to treat as runtime request
	 * 														(initial URL passed by user to `dispatchFetch()`)
	 * @param cfBlob							`request.cf` blob override for runtime requests
	 */
	constructor(
		private readonly globalDispatcher: undici.Dispatcher,
		private readonly runtimeDispatcher: undici.Dispatcher,
		private readonly actualRuntimeOrigin: string,
		private readonly userRuntimeOrigin: string,
		cfBlob?: IncomingRequestCfProperties
	) {
		super();
		if (cfBlob !== undefined) this.cfBlobJson = JSON.stringify(cfBlob);
	}

	addHeaders(
		/* mut */ headers: undici.Headers,
		path: string // Including query parameters
	) {
		// Reconstruct URL using runtime origin specified with `dispatchFetch()`
		const originalURL = this.userRuntimeOrigin + path;
		headers.set(CoreHeaders.ORIGINAL_URL, originalURL);
		headers.set(CoreHeaders.DISABLE_PRETTY_ERROR, "true");
		if (this.cfBlobJson !== undefined) {
			// Only add this header if a `cf` override was set
			headers.set(CoreHeaders.CF_BLOB, this.cfBlobJson);
		}
	}

	dispatch(
		/* mut */ options: undici.Dispatcher.DispatchOptions,
		handler: undici.Dispatcher.DispatchHandler
	): boolean {
		let origin = String(options.origin);
		// The first request in a redirect chain will always match the user origin
		if (origin === this.userRuntimeOrigin) origin = this.actualRuntimeOrigin;
		if (origin === this.actualRuntimeOrigin) {
			// If this is now a request to the runtime, rewrite dispatching origin to
			// the runtime's
			options.origin = origin;

			let path = options.path;
			if (options.query !== undefined) {
				// `options.path` may include query parameters, so we need to parse it
				const url = new URL(path, "http://placeholder/");
				for (const [key, value] of Object.entries(options.query)) {
					url.searchParams.append(key, value);
				}
				path = url.pathname + url.search;
			}

			const headers = convertUndiciHeadersToStandard(options.headers ?? {});

			this.addHeaders(headers, path);

			options.headers = headers;

			// Sometimes, keep-alive connections can sometimes cause issues with sockets
			// disconnecting unexpectedly. To mitigate this, try to avoid keep-alive race
			// conditions by telling the runtime to close the connection immediately after
			// the request is complete
			options.reset = true;

			// Dispatch with runtime dispatcher to avoid certificate errors if using
			// self-signed certificate
			return this.runtimeDispatcher.dispatch(options, handler);
		} else {
			// If this wasn't a request to the runtime (e.g. redirect to somewhere
			// else), use the regular global dispatcher, without special headers
			return this.globalDispatcher.dispatch(options, handler);
		}
	}

	close(): Promise<void>;
	close(callback: () => void): void;
	async close(callback?: () => void): Promise<void> {
		await Promise.all([
			this.globalDispatcher.close(),
			this.runtimeDispatcher.close(),
		]);
		callback?.();
	}

	destroy(): Promise<void>;
	destroy(err: Error | null): Promise<void>;
	destroy(callback: () => void): void;
	destroy(err: Error | null, callback: () => void): void;
	async destroy(
		errCallback?: Error | null | (() => void),
		callback?: () => void
	): Promise<void> {
		let err: Error | null = null;
		if (typeof errCallback === "function") callback = errCallback;
		if (errCallback instanceof Error) err = errCallback;

		await Promise.all([
			this.globalDispatcher.destroy(err),
			this.runtimeDispatcher.destroy(err),
		]);
		callback?.();
	}

	get isMockActive(): boolean {
		// @ts-expect-error missing type on `MockAgent`, but exists at runtime
		return this.globalDispatcher.isMockActive ?? false;
	}
}
