import assert from "assert";
import { TransformStream } from "stream/web";
import { Headers, Request, RequestInit } from "../../http";
import {
	CfHeader,
	GET,
	PURGE,
	PUT,
	RouteHandler,
	Router,
	decodePersist,
} from "../shared";
import { HEADER_CACHE_WARN_USAGE } from "./constants";
import { CacheGateway } from "./gateway";

export interface CacheParams {
	uri: string;
}

function decodeNamespace(headers: Headers) {
	const namespace = headers.get(CfHeader.CacheNamespace);
	return namespace === null ? `default` : `named:${namespace}`;
}

const CR = "\r".charCodeAt(0);
const LF = "\n".charCodeAt(0);

// Remove `Transfer-Encoding: chunked` header from the HTTP `message` if it
// exists. Why do we need to do this?
//
// With the following code:
//
// ```js
// const { readable, writable } = new IdentityTransformStream();
// const encoder = new TextEncoder();
// const writer = writable.getWriter();
// void writer.write(encoder.encode("hello"));
// void writer.write(encoder.encode("world"));
// void writer.close();
// const response = new Response(readable, {
//   headers: { "Cache-Control": "max-age=3600" },
// });
// await caches.default.put(key, response);
// ```
//
// ...the Miniflare loopback server will receive the following HTTP request:
//
// ```http
// PUT / HTTP/1.1
// Transfer-Encoding: chunked
// Host: localhost
//
// 4c
// HTTP/1.1 200 OK
// Transfer-Encoding: chunked
// Cache-Control: max-age=3600
//
//
// 5
// hello
// 5
// world
// 0
// ```
//
// The body of this request (what the `body` variable here stores) will be:
//
// ```http
// HTTP/1.1 200 OK
// Transfer-Encoding: chunked
// Cache-Control: max-age=3600
//
//
// helloworld
// ```
//
// ...which is invalid `chunked` `Transfer-Encoding`
// (https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Transfer-Encoding#directives)
// as there aren't any chunk lengths. This is working as intended, as the
// internal version of the cache gateway API wants responses in this format.
// However, the `llhttp` (https://github.com/nodejs/llhttp) parser used by
// `undici` will throw on receiving this.
//
// Therefore, we just remove the `Transfer-Encoding: chunked` header. We never
// reuse sockets when parsing HTTP requests, so we don't need to worry about
// delimiting HTTP messages.
/** @internal */
export class _RemoveTransformEncodingChunkedStream extends TransformStream<
	Uint8Array,
	Uint8Array
> {
	constructor() {
		let buffer = Buffer.alloc(0);
		let replaced = false;

		super({
			transform(chunk, controller) {
				if (replaced) {
					controller.enqueue(chunk);
				} else {
					// TODO(perf): make this more efficient, we should be able to do
					//  something like a "rope-string" of chunks for finding the index,
					//  recording where we last got to when looking and starting there
					buffer = Buffer.concat([buffer, chunk]);
					const endOfHeadersIndex = buffer.findIndex(
						(_value, index) =>
							buffer[index] === CR &&
							buffer[index + 1] === LF &&
							buffer[index + 2] === CR &&
							buffer[index + 3] === LF
					);
					if (endOfHeadersIndex !== -1) {
						const headers = buffer.subarray(0, endOfHeadersIndex).toString();
						const replacedHeaders = headers.replace(
							/\r\nTransfer-Encoding: chunked/i,
							""
						);
						controller.enqueue(Buffer.from(replacedHeaders, "utf8"));
						controller.enqueue(buffer.subarray(endOfHeadersIndex));
						replaced = true;
					}
				}
			},
			flush(controller) {
				if (!replaced) controller.enqueue(buffer);
			},
		});
	}
}

// noinspection DuplicatedCode
export class CacheRouter extends Router<CacheGateway> {
	#warnedUsage = false;
	#maybeWarnUsage(headers: Headers) {
		if (!this.#warnedUsage && headers.get(HEADER_CACHE_WARN_USAGE) === "true") {
			this.#warnedUsage = true;
			this.log.warn(
				"Cache operations will have no impact if you deploy to a workers.dev subdomain!"
			);
		}
	}

	@GET("/:uri")
	match: RouteHandler<CacheParams> = async (req, params) => {
		this.#maybeWarnUsage(req.headers);
		const uri = decodeURIComponent(params.uri);
		const namespace = decodeNamespace(req.headers);
		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(namespace, persist);
		const key = new Request(uri, req as RequestInit);
		return gateway.match(key, req.cf?.cacheKey);
	};

	@PUT("/:uri")
	put: RouteHandler<CacheParams> = async (req, params) => {
		this.#maybeWarnUsage(req.headers);
		const uri = decodeURIComponent(params.uri);
		const namespace = decodeNamespace(req.headers);
		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(namespace, persist);

		const key = new Request(uri, { ...(req as RequestInit), body: undefined });
		const removerStream = new _RemoveTransformEncodingChunkedStream();
		assert(req.body !== null);
		const bodyStream = req.body.pipeThrough(removerStream);
		return gateway.put(key, bodyStream, req.cf?.cacheKey);
	};

	@PURGE("/:uri")
	delete: RouteHandler<CacheParams> = async (req, params) => {
		this.#maybeWarnUsage(req.headers);
		const uri = decodeURIComponent(params.uri);
		const namespace = decodeNamespace(req.headers);
		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(namespace, persist);
		const key = new Request(uri, req as RequestInit);
		return gateway.delete(key, req.cf?.cacheKey);
	};
}
