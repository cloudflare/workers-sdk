import assert from "assert";
import crypto from "crypto";
import http from "http";
import { AddressInfo } from "net";
import CachePolicy from "http-cache-semantics";
import { Headers, HeadersInit, Request, Response, fetch } from "../../http";
import { Clock, Log, millisToSeconds } from "../../shared";
import { Storage } from "../../storage";
import { isSitesRequest } from "../kv";
import { CacheMiss, PurgeFailure, StorageFailure } from "./errors";
import { _getRangeResponse } from "./range";

interface CacheMetadata {
	headers: string[][];
	status: number;
}

function getExpiration(clock: Clock, req: Request, res: Response) {
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
	CachePolicy.prototype.now = clock;
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

// Lifted from Miniflare 2
function getMatchResponse(
	reqHeaders: Headers,
	resStatus: number,
	resHeaders: Headers,
	resBody: Uint8Array
): Response {
	// If `If-None-Match` is set, perform a conditional request:
	// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-None-Match
	const reqIfNoneMatchHeader = reqHeaders.get("If-None-Match");
	const resETagHeader = resHeaders.get("ETag");
	if (reqIfNoneMatchHeader !== null && resETagHeader !== null) {
		const resETag = parseETag(resETagHeader);
		if (resETag !== undefined) {
			if (reqIfNoneMatchHeader.trim() === "*") {
				return new Response(null, { status: 304, headers: resHeaders });
			}
			for (const reqIfNoneMatch of reqIfNoneMatchHeader.split(",")) {
				if (resETag === parseETag(reqIfNoneMatch)) {
					return new Response(null, { status: 304, headers: resHeaders });
				}
			}
		}
	}

	// If `If-Modified-Since` is set, perform a conditional request:
	// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Modified-Since
	const reqIfModifiedSinceHeader = reqHeaders.get("If-Modified-Since");
	const resLastModifiedHeader = resHeaders.get("Last-Modified");
	if (reqIfModifiedSinceHeader !== null && resLastModifiedHeader !== null) {
		const reqIfModifiedSince = parseUTCDate(reqIfModifiedSinceHeader);
		const resLastModified = parseUTCDate(resLastModifiedHeader);
		// Comparison of NaN's (invalid dates), will always result in `false`
		if (resLastModified <= reqIfModifiedSince) {
			return new Response(null, { status: 304, headers: resHeaders });
		}
	}

	// If `Range` is set, return a partial response:
	// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Range
	const reqRangeHeader = reqHeaders.get("Range");
	if (reqRangeHeader !== null) {
		return _getRangeResponse(reqRangeHeader, resStatus, resHeaders, resBody);
	}

	// Otherwise, return the full response
	return new Response(resBody, { status: resStatus, headers: resHeaders });
}

class CacheResponse {
	constructor(
		readonly metadata: CacheMetadata,
		readonly value: Uint8Array
	) {}
	toResponse(): Response {
		return new Response(this.value, {
			status: this.metadata.status,
			headers: this.metadata.headers,
		});
	}
}

interface ParsedHttpResponse {
	headers: Headers;
	status: number;
	body: Uint8Array;
}
class HttpParser {
	readonly server: http.Server;
	readonly responses: Map<string, Uint8Array> = new Map();
	readonly connected: Promise<void>;
	private static INSTANCE: HttpParser;
	static get(): HttpParser {
		HttpParser.INSTANCE ??= new HttpParser();
		return HttpParser.INSTANCE;
	}
	private constructor() {
		this.server = http.createServer(this.listen.bind(this));
		this.connected = new Promise((accept) => {
			this.server.listen(0, "localhost", accept);
		});
	}
	private listen(request: http.IncomingMessage, response: http.ServerResponse) {
		assert(request.url !== undefined);
		assert(response.socket !== null);
		const array = this.responses.get(request.url);
		assert(array !== undefined);
		// Write response to parse directly to underlying socket
		response.socket.write(array);
		response.socket.end();
	}
	public async parse(response: Uint8Array): Promise<ParsedHttpResponse> {
		await this.connected;
		// Since multiple parses can be in-flight at once, an identifier is needed
		const id = `/${crypto.randomBytes(16).toString("hex")}`;
		this.responses.set(id, response);
		const address = this.server.address()! as AddressInfo;
		try {
			const parsedResponse = await fetch(
				`http://localhost:${address.port}${id}`
			);
			const body = await parsedResponse.arrayBuffer();
			return {
				headers: parsedResponse.headers,
				status: parsedResponse.status,
				body: new Uint8Array(body),
			};
		} finally {
			this.responses.delete(id);
		}
	}
}

export class CacheGateway {
	constructor(
		private readonly log: Log,
		private readonly storage: Storage,
		private readonly clock: Clock
	) {}

	async match(request: Request, cacheKey?: string): Promise<Response> {
		// Never cache Workers Sites requests, so we always return on-disk files
		if (isSitesRequest(request)) throw new CacheMiss();

		cacheKey ??= request.url;
		const cached = await this.storage.get<CacheMetadata>(cacheKey);
		if (cached?.metadata === undefined) throw new CacheMiss();

		const response = new CacheResponse(
			cached.metadata,
			cached.value
		).toResponse();
		response.headers.set("CF-Cache-Status", "HIT");

		return getMatchResponse(
			request.headers,
			cached.metadata.status,
			response.headers,
			cached.value
		);
	}

	async put(
		request: Request,
		value: Uint8Array,
		cacheKey?: string
	): Promise<Response> {
		// Never cache Workers Sites requests, so we always return on-disk files
		if (isSitesRequest(request)) return new Response(null, { status: 204 });

		const response = await HttpParser.get().parse(value);

		const { storable, expiration, headers } = getExpiration(
			this.clock,
			request,
			new Response(response.body, {
				status: response.status,
				headers: response.headers,
			})
		);
		if (!storable) {
			throw new StorageFailure();
		}

		cacheKey ??= request.url;
		await this.storage.put<CacheMetadata>(cacheKey, {
			value: response.body,
			expiration: millisToSeconds(this.clock() + expiration),
			metadata: {
				headers: Object.entries(headers),
				status: response.status,
			},
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
