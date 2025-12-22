import assert from "node:assert";
import http from "node:http";
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
	const request = new Request(input, requestInit);

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

	const response = await undici.fetch(request, {
		dispatcher: requestInit?.dispatcher,
	});
	return new Response(response.body, response);
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
