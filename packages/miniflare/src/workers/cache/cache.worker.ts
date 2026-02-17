import assert from "node:assert";
import { Buffer } from "node:buffer";
import CachePolicy from "http-cache-semantics";
import {
	DeferredPromise,
	DELETE,
	GET,
	InclusiveRange,
	KeyValueStorage,
	LogLevel,
	MiniflareDurableObject,
	MiniflareDurableObjectCf,
	MultipartReadableStream,
	parseRanges,
	PURGE,
	PUT,
	RouteHandler,
	Timers,
} from "miniflare:shared";
import { isSitesRequest } from "../kv";
import { CacheObjectCf } from "./constants";
import {
	CacheMiss,
	PurgeFailure,
	RangeNotSatisfiable,
	StorageFailure,
} from "./errors.worker";

interface CacheMetadata {
	headers: string[][];
	status: number;
	size: number;
}

type CacheRouteHandler = RouteHandler<
	unknown,
	RequestInitCfProperties & MiniflareDurableObjectCf & CacheObjectCf
>;

function getCacheKey(req: Request<unknown, RequestInitCfProperties>) {
	return req.cf?.cacheKey ? String(req.cf?.cacheKey) : req.url;
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

const CR = "\r".charCodeAt(0);
const LF = "\n".charCodeAt(0);
const STATUS_REGEXP =
	/^HTTP\/\d(?:\.\d)? (?<rawStatusCode>\d+) (?<statusText>.*)$/;
export async function parseHttpResponse(
	stream: ReadableStream
): Promise<Response> {
	// Buffer until first "\r\n\r\n"
	let buffer = Buffer.alloc(0);
	let blankLineIndex = -1;
	for await (const chunk of stream.values({ preventCancel: true })) {
		// TODO(perf): make this more efficient, we should be able to do something
		//  like a "rope-string" of chunks for finding the index, recording where we
		//  last got to when looking and starting there
		buffer = Buffer.concat([buffer, chunk]);
		blankLineIndex = buffer.findIndex(
			(_value, index) =>
				buffer[index] === CR &&
				buffer[index + 1] === LF &&
				buffer[index + 2] === CR &&
				buffer[index + 3] === LF
		);
		if (blankLineIndex !== -1) break;
	}
	assert(blankLineIndex !== -1, "Expected to find blank line in HTTP message");

	// Parse status and headers
	const rawStatusHeaders = buffer.subarray(0, blankLineIndex).toString();
	const [rawStatus, ...rawHeaders] = rawStatusHeaders.split("\r\n");
	// https://www.rfc-editor.org/rfc/rfc7230#section-3.1.2
	const statusMatch = rawStatus.match(STATUS_REGEXP);
	assert(
		statusMatch?.groups != null,
		`Expected first line ${JSON.stringify(rawStatus)} to be HTTP status line`
	);
	const { rawStatusCode, statusText } = statusMatch.groups;
	const statusCode = parseInt(rawStatusCode);
	// https://www.rfc-editor.org/rfc/rfc7230#section-3.2
	const headers = rawHeaders.map((rawHeader) => {
		const index = rawHeader.indexOf(":");
		return [
			rawHeader.substring(0, index),
			rawHeader.substring(index + 1).trim(),
		];
	});

	// Construct body, by concatenating prefix (what we read over from headers)
	// with the rest of the stream
	const prefix = buffer.subarray(blankLineIndex + 4 /* "\r\n\r\n" */);
	// Even if `prefix.length === 0` here, we need to construct a new stream.
	// Otherwise, we'll get a `TypeError: This ReadableStream is disturbed...`
	// when constructing the `Response` below.
	const { readable, writable } = new IdentityTransformStream();
	const writer = writable.getWriter();
	void writer
		.write(prefix)
		.then(() => {
			writer.releaseLock();
			return stream.pipeTo(writable);
		})
		.catch((e) => console.error("Error writing HTTP body:", e));

	return new Response(readable, { status: statusCode, statusText, headers });
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

export class CacheObject extends MiniflareDurableObject {
	#warnedUsage = false;
	async #maybeWarnUsage(request: Request<unknown, CacheObjectCf>) {
		if (!this.#warnedUsage && request.cf?.miniflare?.cacheWarnUsage === true) {
			this.#warnedUsage = true;
			await this.logWithLevel(
				LogLevel.WARN,
				"Cache operations will have no impact if you deploy to a workers.dev subdomain!"
			);
		}
	}

	#storage?: KeyValueStorage<CacheMetadata>;
	get storage() {
		// `KeyValueStorage` can only be constructed once `this.blob` is initialised
		return (this.#storage ??= new KeyValueStorage(this));
	}

	@GET()
	match: CacheRouteHandler = async (req) => {
		await this.#maybeWarnUsage(req);
		const cacheKey = getCacheKey(req);

		// Never cache Workers Sites requests, so we always return on-disk files
		if (isSitesRequest(req)) throw new CacheMiss();

		let resHeaders: Headers | undefined;
		let resRanges: InclusiveRange[] | undefined;

		const cached = await this.storage.get(cacheKey, ({ size, headers }) => {
			resHeaders = new Headers(headers);
			const contentType = resHeaders.get("Content-Type");

			// Need size from metadata to parse `Range` header
			const rangeHeader = req.headers.get("Range");
			if (rangeHeader !== null) {
				resRanges = parseRanges(rangeHeader, size);
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

		return getMatchResponse(req.headers, {
			status: cached.metadata.status,
			headers: resHeaders,
			ranges: resRanges,
			body: cached.value,
			totalSize: cached.metadata.size,
		});
	};

	@PUT()
	put: CacheRouteHandler = async (req) => {
		await this.#maybeWarnUsage(req);
		const cacheKey = getCacheKey(req);

		// Never cache Workers Sites requests, so we always return on-disk files
		if (isSitesRequest(req)) throw new CacheMiss();

		assert(req.body !== null);
		const res = await parseHttpResponse(req.body);
		let body = res.body;
		assert(body !== null);

		const { storable, expiration, headers } = getExpiration(
			this.timers,
			req,
			res
		);
		if (!storable) {
			// Make sure `body` is consumed to avoid `TypeError: Can't read from
			// request stream after response has been sent.`
			try {
				await body.pipeTo(new WritableStream());
			} catch {}
			throw new StorageFailure();
		}

		// If we know the size, avoid passing the body through a transform stream to
		// count it (trusting `workerd` to send correct value here).
		// Safety of `!`: `parseInt(null)` is `NaN`
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const contentLength = parseInt(res.headers.get("Content-Length")!);
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
			status: res.status,
			size,
		}));

		await this.storage.put({
			key: cacheKey,
			value: body,
			expiration: this.timers.now() + expiration,
			metadata,
		});
		return new Response(null, { status: 204 });
	};

	@PURGE()
	delete: CacheRouteHandler = async (req) => {
		await this.#maybeWarnUsage(req);
		const cacheKey = getCacheKey(req);

		const deleted = await this.storage.delete(cacheKey);
		// This is an extremely vague error, but it fits with what the cache API in workerd expects
		if (!deleted) throw new PurgeFailure();
		return new Response(null);
	};

	@DELETE("/purge-all")
	purgeAll: CacheRouteHandler = async () => {
		const deletedCount = this.storage.deleteAll();
		return Response.json({ deleted: deletedCount });
	};
}
