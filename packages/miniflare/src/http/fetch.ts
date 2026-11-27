import assert from "node:assert";
import { pipeline, Transform } from "node:stream";
import zlib from "node:zlib";
import * as undici from "undici";
import NodeWebSocket from "ws";
import { CoreHeaders, DeferredPromise } from "../workers";
import { Request } from "./request";
import { Response } from "./response";
import { coupleWebSocket, WebSocketPair } from "./websocket";
import type { RequestInfo, RequestInit } from "./request";
import type { IncomingRequestCfProperties } from "@cloudflare/workers-types/experimental";
import type http from "node:http";
import type { Readable, TransformCallback } from "node:stream";
import type { UndiciHeaders } from "undici/types/dispatcher";

const ignored = ["transfer-encoding", "connection", "keep-alive", "expect"];

// Statuses whose responses have no body, which `undici.fetch()` doesn't decode
const nullBodyStatuses = [101, 204, 205, 304];
// `undici.fetch()` rejects responses with more content codings than this
const maxContentEncodings = 5;

export async function fetch(
	input: RequestInfo,
	init?: RequestInit | Request
): Promise<Response> {
	const requestInit = init as RequestInit;
	const request = new Request(input, requestInit);

	// Handle WebSocket upgrades
	if (
		request.method === "GET" &&
		request.headers.get("upgrade") === "websocket"
	) {
		const url = new URL(request.url);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			throw new TypeError(
				`Fetch API cannot load: ${url.toString()}\nMake sure you're using http(s):// URLs for WebSocket requests via fetch.`
			);
		}
		// `ws` doesn't use `dispatcher`, so apply its origin rewrite here
		if (requestInit?.dispatcher instanceof DispatchFetchDispatcher) {
			requestInit.dispatcher.rewriteOrigin(url);
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
		ws.once("error", (error) => {
			responsePromise.reject(error);
		});
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
			// `ws` passes the body through as sent, but `undici.fetch()` decodes
			// it, and callers such as `dispatchFetch()` rely on that
			let body: Readable;
			try {
				body = decodeResponseBody(
					req,
					req.statusCode,
					headers.get("Content-Encoding")
				);
			} catch (error) {
				req.destroy();
				responsePromise.reject(new TypeError("fetch failed", { cause: error }));
				return;
			}
			const response = new Response(body, {
				status: req.statusCode,
				headers,
			});
			responsePromise.resolve(response);
		});
		return responsePromise;
	}

	const response = await undici.fetch(request, {
		dispatcher: requestInit?.dispatcher,
	});
	return new Response(response.body, response);
}

/**
 * Decodes a response body according to its `Content-Encoding`, as
 * `undici.fetch()` does for the bodies of the responses it returns:
 * https://github.com/nodejs/undici/blob/v7.30.2/lib/web/fetch/index.js#L2221-L2270
 *
 * @param body The response body, as received
 * @param status The response's status
 * @param contentEncoding The response's `Content-Encoding` header
 * @returns The decoded body, or `body` itself if it can't or needn't be decoded
 * @throws If the response has more content codings than `undici.fetch()` allows
 */
function decodeResponseBody(
	body: Readable,
	status: number | undefined,
	contentEncoding: string | null
): Readable {
	if (
		contentEncoding === null ||
		(status !== undefined && nullBodyStatuses.includes(status))
	) {
		return body;
	}
	// "All content-coding values are case-insensitive"
	const codings = contentEncoding.toLowerCase().split(",");
	if (codings.length > maxContentEncodings) {
		throw new Error(
			`too many content-encodings in response: ${codings.length}, maximum allowed is ${maxContentEncodings}`
		);
	}
	// Codings are listed in the order they were applied, so undo the last first
	const decoders: Transform[] = [];
	for (let i = codings.length - 1; i >= 0; i--) {
		const coding = codings[i].trim();
		if (coding === "gzip" || coding === "x-gzip") {
			decoders.push(
				zlib.createGunzip({
					flush: zlib.constants.Z_SYNC_FLUSH,
					finishFlush: zlib.constants.Z_SYNC_FLUSH,
				})
			);
		} else if (coding === "deflate") {
			decoders.push(new InflateStream());
		} else if (coding === "br") {
			decoders.push(
				zlib.createBrotliDecompress({
					flush: zlib.constants.BROTLI_OPERATION_FLUSH,
					finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH,
				})
			);
		} else if (
			coding === "zstd" &&
			typeof zlib.createZstdDecompress === "function"
		) {
			decoders.push(
				zlib.createZstdDecompress({
					flush: zlib.constants.ZSTD_e_continue,
					finishFlush: zlib.constants.ZSTD_e_end,
				})
			);
		} else {
			// Leave a body with a coding we can't decode as it is
			return body;
		}
	}
	if (decoders.length === 0) {
		return body;
	}
	// An error destroys the last decoder, which surfaces it to the body's reader
	pipeline([body, ...decoders], () => {});
	return decoders[decoders.length - 1];
}

/**
 * Inflates a `deflate` body, whether or not it has a zlib header, as servers
 * send either: https://github.com/nodejs/undici/blob/v7.30.2/lib/web/fetch/util.js#L1240-L1274
 */
class InflateStream extends Transform {
	#inflate?: zlib.Inflate | zlib.InflateRaw;

	_transform(
		chunk: Buffer,
		encoding: BufferEncoding,
		callback: TransformCallback
	) {
		if (this.#inflate === undefined) {
			if (chunk.length === 0) {
				callback();
				return;
			}
			const options = {
				flush: zlib.constants.Z_SYNC_FLUSH,
				finishFlush: zlib.constants.Z_SYNC_FLUSH,
			};
			// A zlib header's compression method is always 8 (deflate)
			this.#inflate =
				(chunk[0] & 0x0f) === 0x08
					? zlib.createInflate(options)
					: zlib.createInflateRaw(options);
			this.#inflate.on("data", (data: Buffer) => this.push(data));
			this.#inflate.on("end", () => this.push(null));
			this.#inflate.on("error", (error) => this.destroy(error));
		}
		this.#inflate.write(chunk, encoding, callback);
	}

	_final(callback: (error?: Error | null) => void) {
		this.#inflate?.end();
		callback();
	}
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
		if (cfBlob !== undefined) {
			this.cfBlobJson = JSON.stringify(cfBlob);
		}
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

	rewriteOrigin(/* mut */ url: URL) {
		if (url.origin === this.userRuntimeOrigin) {
			const runtimeURL = new URL(this.actualRuntimeOrigin);
			url.protocol = runtimeURL.protocol;
			url.host = runtimeURL.host;
		}
	}

	dispatch(
		/* mut */ options: undici.Dispatcher.DispatchOptions,
		handler: undici.Dispatcher.DispatchHandler
	): boolean {
		let origin = String(options.origin);
		// The first request in a redirect chain will always match the user origin
		if (origin === this.userRuntimeOrigin) {
			origin = this.actualRuntimeOrigin;
		}
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

			// Worker handlers can have side effects even for GET/HEAD, so never
			// replay a request after a transport failure or pipeline it behind another
			options.idempotent = false;

			// Reuse successful connections for every method to avoid consuming one
			// ephemeral port per dispatch, but surface failures instead of retrying
			options.reset = false;

			// undici 7 still invokes these callbacks. The published types mark them
			// deprecated, so the names live on a local shape and the lint rule
			// does not see the deprecated declarations.
			const legacy = handler as {
				onHeaders?(
					status: number,
					rawHeaders: Buffer[],
					resume: () => void,
					statusText: string
				): boolean;
				onError?(err: Error): void;
			};
			const onHeaders = legacy.onHeaders;
			const onError = legacy.onError;
			if (onHeaders !== undefined && onError !== undefined) {
				let responseStatus = 0;
				legacy.onHeaders = function (status, rawHeaders, resume, statusText) {
					if (status >= 200) {
						// 1xx replies arrive here before the final status;
						// keep the final status >= 200
						responseStatus = status;
					}
					return onHeaders.call(this, status, rawHeaders, resume, statusText);
				};
				legacy.onError = function (err) {
					// A 421 retry aborts this connection. Ignore that abort so the
					// replayed body still matches Content-Length.
					const retryAbort =
						responseStatus === 421 &&
						err instanceof DOMException &&
						err.name === "AbortError";
					if (retryAbort) {
						return;
					}
					return onError.call(this, err);
				};
			}

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
		if (typeof errCallback === "function") {
			callback = errCallback;
		}
		if (errCallback instanceof Error) {
			err = errCallback;
		}

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
