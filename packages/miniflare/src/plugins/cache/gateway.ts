import assert from "assert";
import crypto from "crypto";
import http from "http";
import { ReadableStream, TransformStream } from "stream/web";
import CachePolicy from "http-cache-semantics";
import { Headers, HeadersInit, Request, Response, fetch } from "../../http";
import { DeferredPromise, Log, Timers } from "../../shared";
import {
	InclusiveRange,
	KeyValueStorage,
	MultipartReadableStream,
	Storage,
} from "../../storage";
import { isSitesRequest } from "../kv";
import { _parseRanges } from "../shared";
import {
	CacheMiss,
	PurgeFailure,
	RangeNotSatisfiable,
	StorageFailure,
} from "./errors";

interface CacheMetadata {
	headers: string[][];
	status: number;
	size: number;
}

function getExpiration(timers: Timers, req: Request, res: Response) {
	// Cloudflare ignores request Cache-Control
	const reqHeaders = normaliseHeaders(req.headers);
	delete reqHeaders["cache-control"];

	// Cloudflare never caches responses with Set-Cookie headers
	// If Cache-Control contains private=set-cookie, Cloudflare will remove
	// the Set-Cookie header automatically
	const resHeaders = normaliseHeaders(res.headers);
	if (
		resHeaders["cache-control"]?.toLowerCase().includes("private=set-cookie")
	) {
		resHeaders["cache-control"] = resHeaders["cache-control"]
			?.toLowerCase()
			.replace(/private=set-cookie;?/i, "");
		delete resHeaders["set-cookie"];
	}

	// Build request and responses suitable for CachePolicy
	const cacheReq: CachePolicy.Request = {
		url: req.url,
		// If a request gets to the Cache service, it's method will be GET. See README.md for details
		method: "GET",
		headers: reqHeaders,
	};
	const cacheRes: CachePolicy.Response = {
		status: res.status,
		headers: resHeaders,
	};

	// @ts-expect-error `now` isn't included in CachePolicy's type definitions
	const originalNow = CachePolicy.prototype.now;
	// @ts-expect-error `now` isn't included in CachePolicy's type definitions
	CachePolicy.prototype.now = timers.now;
	try {
		const policy = new CachePolicy(cacheReq, cacheRes, { shared: true });

		return {
			// Check if the request & response is cacheable
			storable: policy.storable() && !("set-cookie" in resHeaders),
			expiration: policy.timeToLive(),
			// Cache Policy Headers is typed as [header: string]: string | string[] | undefined
			// It's safe to ignore the undefined here, which is what casting to HeadersInit does
			headers: policy.responseHeaders() as HeadersInit,
		};
	} finally {
		// @ts-expect-error `now` isn't included in CachePolicy's type definitions
		CachePolicy.prototype.now = originalNow;
	}
}

// Normalises headers to object mapping lower-case names to single values.
// Single values are OK here as the headers we care about for determining
// cache-ability are all single-valued, and we store the raw, multi-valued
// headers in KV once this has been determined.
function normaliseHeaders(headers: Headers): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of headers) result[key.toLowerCase()] = value;
	return result;
}

// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag#syntax
const etagRegexp = /^(W\/)?"(.+)"$/;
function parseETag(value: string): string | undefined {
	// As we only use this for `If-None-Match` handling, which always uses the
	// weak comparison algorithm, ignore "W/" directives:
	// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-None-Match
	return etagRegexp.exec(value.trim())?.[2] ?? undefined;
}

// https://datatracker.ietf.org/doc/html/rfc7231#section-7.1.1.1
const utcDateRegexp =
	/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d\d (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d\d\d\d \d\d:\d\d:\d\d GMT$/;
function parseUTCDate(value: string): number {
	return utcDateRegexp.test(value) ? Date.parse(value) : NaN;
}

interface CachedResponse {
	status: number;
	headers: Headers;
	ranges: InclusiveRange[];
	body: ReadableStream<Uint8Array> | MultipartReadableStream;
	totalSize: number;
}
function getMatchResponse(reqHeaders: Headers, res: CachedResponse): Response {
	// If `If-None-Match` is set, perform a conditional request:
	// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-None-Match
	const reqIfNoneMatchHeader = reqHeaders.get("If-None-Match");
	const resETagHeader = res.headers.get("ETag");
	if (reqIfNoneMatchHeader !== null && resETagHeader !== null) {
		const resETag = parseETag(resETagHeader);
		if (resETag !== undefined) {
			if (reqIfNoneMatchHeader.trim() === "*") {
				return new Response(null, { status: 304, headers: res.headers });
			}
			for (const reqIfNoneMatch of reqIfNoneMatchHeader.split(",")) {
				if (resETag === parseETag(reqIfNoneMatch)) {
					return new Response(null, { status: 304, headers: res.headers });
				}
			}
		}
	}

	// If `If-Modified-Since` is set, perform a conditional request:
	// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Modified-Since
	const reqIfModifiedSinceHeader = reqHeaders.get("If-Modified-Since");
	const resLastModifiedHeader = res.headers.get("Last-Modified");
	if (reqIfModifiedSinceHeader !== null && resLastModifiedHeader !== null) {
		const reqIfModifiedSince = parseUTCDate(reqIfModifiedSinceHeader);
		const resLastModified = parseUTCDate(resLastModifiedHeader);
		// Comparison of NaN's (invalid dates), will always result in `false`
		if (resLastModified <= reqIfModifiedSince) {
			return new Response(null, { status: 304, headers: res.headers });
		}
	}

	// If `Range` was set, return a partial response:
	// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Range
	if (res.ranges.length > 0) {
		res.status = 206; // Partial Content
		if (res.ranges.length > 1) {
			assert(!(res.body instanceof ReadableStream)); // assert(isMultipart)
			res.headers.set("Content-Type", res.body.multipartContentType);
		} else {
			const { start, end } = res.ranges[0];
			res.headers.set(
				"Content-Range",
				`bytes ${start}-${end}/${res.totalSize}`
			);
			res.headers.set("Content-Length", `${end - start + 1}`);
		}
	}

	if (!(res.body instanceof ReadableStream)) res.body = res.body.body;
	return new Response(res.body, { status: res.status, headers: res.headers });
}

/** @internal */
export class _HttpParser {
	private static INSTANCE: _HttpParser;
	static get(): _HttpParser {
		_HttpParser.INSTANCE ??= new _HttpParser();
		return _HttpParser.INSTANCE;
	}

	readonly #responses: Map<string, ReadableStream<Uint8Array>> = new Map();
	readonly #ready: Promise<URL>;

	private constructor() {
		const server = http.createServer(this.#listen).unref();
		this.#ready = new Promise((resolve) => {
			server.listen(0, "localhost", () => {
				const address = server.address();
				assert(address !== null && typeof address === "object");
				resolve(new URL(`http://localhost:${address.port}`));
			});
		});
	}

	#listen: http.RequestListener = async (req, res) => {
		assert(req.url !== undefined);
		assert(res.socket !== null);
		const stream = this.#responses.get(req.url);
		assert(stream !== undefined);
		// Write response to parse directly to underlying socket
		for await (const chunk of stream) res.socket.write(chunk);
		res.socket.end();
	};

	async parse(response: ReadableStream<Uint8Array>): Promise<Response> {
		const baseURL = await this.#ready;
		// Since multiple parses can be in-flight at once, an identifier is needed
		const id = `/${crypto.randomBytes(16).toString("hex")}`;
		this.#responses.set(id, response);
		try {
			return await fetch(new URL(id, baseURL));
		} finally {
			this.#responses.delete(id);
		}
	}
}

class SizingStream extends TransformStream<Uint8Array, Uint8Array> {
	readonly size: Promise<number>;

	constructor() {
		const sizePromise = new DeferredPromise<number>();
		let size = 0;
		super({
			transform(chunk, controller) {
				size += chunk.byteLength;
				controller.enqueue(chunk);
			},
			flush() {
				sizePromise.resolve(size);
			},
		});
		this.size = sizePromise;
	}
}

export class CacheGateway {
	private readonly storage: KeyValueStorage<CacheMetadata>;

	constructor(
		private readonly log: Log,
		storage: Storage,
		private readonly timers: Timers
	) {
		this.storage = new KeyValueStorage(storage, timers);
	}

	async match(request: Request, cacheKey?: string): Promise<Response> {
		// Never cache Workers Sites requests, so we always return on-disk files
		if (isSitesRequest(request)) throw new CacheMiss();
		cacheKey ??= request.url;

		let resHeaders: Headers | undefined;
		let resRanges: InclusiveRange[] | undefined;

		const cached = await this.storage.get(cacheKey, ({ size, headers }) => {
			resHeaders = new Headers(headers);
			const contentType = resHeaders.get("Content-Type");

			// Need size from metadata to parse `Range` header
			const rangeHeader = request.headers.get("Range");
			if (rangeHeader !== null) {
				resRanges = _parseRanges(rangeHeader, size);
				if (resRanges === undefined) throw new RangeNotSatisfiable(size);
			}

			return {
				ranges: resRanges,
				contentLength: size,
				contentType: contentType ?? undefined,
			};
		});
		if (cached?.metadata === undefined) throw new CacheMiss();

		// Should've constructed headers when we extracted range options (the only
		// time we don't do this is when the entry isn't found, or expired, in which
		// case, we just threw a `CacheMiss`)
		assert(resHeaders !== undefined);
		resHeaders.set("CF-Cache-Status", "HIT");
		resRanges ??= [];

		return getMatchResponse(request.headers, {
			status: cached.metadata.status,
			headers: resHeaders,
			ranges: resRanges,
			body: cached.value,
			totalSize: cached.metadata.size,
		});
	}

	async put(
		request: Request,
		value: ReadableStream<Uint8Array>,
		cacheKey?: string
	): Promise<Response> {
		// Never cache Workers Sites requests, so we always return on-disk files.
		if (isSitesRequest(request)) return new Response(null, { status: 204 });

		const response = await _HttpParser.get().parse(value);
		let body = response.body;
		assert(body !== null);

		const { storable, expiration, headers } = getExpiration(
			this.timers,
			request,
			response
		);
		if (!storable) throw new StorageFailure();

		cacheKey ??= request.url;

		// If we know the size, avoid passing the body through a transform stream to
		// count it (trusting `workerd` to send correct value here).
		// Safety of `!`: `parseInt(null)` is `NaN`
		const contentLength = parseInt(response.headers.get("Content-Length")!);
		let sizePromise: Promise<number>;
		if (Number.isNaN(contentLength)) {
			const stream = new SizingStream();
			body = body.pipeThrough(stream);
			sizePromise = stream.size;
		} else {
			sizePromise = Promise.resolve(contentLength);
		}

		const metadata: Promise<CacheMetadata> = sizePromise.then((size) => ({
			headers: Object.entries(headers),
			status: response.status,
			size,
		}));

		await this.storage.put({
			key: cacheKey,
			value: body,
			expiration: this.timers.now() + expiration,
			metadata,
		});
		return new Response(null, { status: 204 });
	}

	async delete(request: Request, cacheKey?: string): Promise<Response> {
		cacheKey ??= request.url;
		const deleted = await this.storage.delete(cacheKey);
		// This is an extremely vague error, but it fits with what the cache API in workerd expects
		if (!deleted) throw new PurgeFailure();
		return new Response(null);
	}
}
