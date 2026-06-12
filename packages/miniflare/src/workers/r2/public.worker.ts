import { cors } from "hono/cors";
import { Hono } from "hono/tiny";
import { CorePaths } from "../core/constants";

type Env = Record<string, R2Bucket>;

// Accept only a single range with start <= end; reject anything else
// (including multiple ranges) with an endpoint-specific 400 rather than
// ignoring it
const RANGE_HEADER = /^bytes=(?:(\d+)-(\d+)?|-\d+)$/;

type ParsedRangeHeader =
	| { error: "malformed" | "inverted" }
	// `start` is undefined for suffix ranges (`bytes=-N`)
	| { start?: number };

function parseRangeHeader(header: string): ParsedRangeHeader {
	const match = RANGE_HEADER.exec(header);
	if (match === null) {
		return { error: "malformed" };
	}
	const [, start, end] = match;
	if (start === undefined) {
		return {};
	}
	if (end !== undefined && Number(start) > Number(end)) {
		return { error: "inverted" };
	}
	return { start: Number(start) };
}

function objectHeaders(object: R2Object): Headers {
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("ETag", object.httpEtag);
	headers.set("Last-Modified", object.uploaded.toUTCString());
	headers.set("Accept-Ranges", "bytes");
	return headers;
}

const app = new Hono<{ Bindings: Env }>().basePath(CorePaths.R2_PUBLIC);

app.use(
	cors({ origin: "*", allowMethods: ["GET", "HEAD"], exposeHeaders: ["*"] })
);

app.on(["GET", "HEAD"], "/:bucketId/:key{.+}", async (c) => {
	const bucketId = decodeURIComponent(c.req.param("bucketId"));
	const key = decodeURIComponent(c.req.param("key"));

	const bucket = c.env[bucketId];
	if (bucket === undefined) {
		return c.notFound();
	}

	// Reject malformed, multiple, and inverted ranges with 400 rather than
	// ignoring them
	const rangeHeader = c.req.header("Range");
	if (rangeHeader !== undefined && "error" in parseRangeHeader(rangeHeader)) {
		return c.body(null, 400);
	}

	// R2 honors Range on HEAD too (206 + Content-Range, no body)
	const hasRange = rangeHeader !== undefined;
	// `bucket.head()` cannot evaluate conditional headers (the R2 head
	// operation only carries the key), so HEAD also uses `bucket.get()` and
	// discards the body.
	const object = await bucket.get(key, {
		onlyIf: c.req.raw.headers,
		range: hasRange ? c.req.raw.headers : undefined,
	});

	if (object === null) {
		return c.notFound();
	}

	const headers = objectHeaders(object);

	if (!("body" in object)) {
		// Some conditional header failed, but `bucket.get()` reports the
		// failure without naming the header. We need to determine which header
		// failed to determine the status code to return.
		//
		// https://datatracker.ietf.org/doc/html/rfc7232#section-6 gives the
		// order for checking headers. We know at least one header failed.
		// We must first check for a precondition header failure.
		//
		// The logic in `_testR2Conditional` ensures we can simultaneously
		// check both "If-Match" and "If-Unmodified-Since" (since a failure in
		// "If-Unmodified-Since" can be suppressed by success for a present
		// "If-Match"). These both yield status 412s upon failure.
		let preconditions: Headers | undefined;
		for (const name of ["If-Match", "If-Unmodified-Since"]) {
			const value = c.req.raw.headers.get(name);
			if (value !== null) {
				preconditions ??= new Headers();
				preconditions.set(name, value);
			}
		}
		if (preconditions !== undefined) {
			const recheck = await bucket.get(key, { onlyIf: preconditions });
			if (recheck === null) {
				return c.notFound();
			}
			if (!("body" in recheck)) {
				return c.body(null, 412);
			}
		}

		// Otherwise, the preconditions hold, so the failure came from a cache validator.
		return c.body(null, { status: 304, headers });
	}

	const body = c.req.method === "HEAD" ? null : object.body;

	const range = object.range;
	if (hasRange && range !== undefined) {
		// The returned range may carry all keys with some `undefined` (e.g.
		// `suffix` present but undefined on an offset range), so normalize by
		// value rather than by key presence
		const normalized: { offset?: number; length?: number; suffix?: number } = {
			...range,
		};
		let offset: number;
		let length: number;
		if (normalized.suffix !== undefined) {
			length = Math.min(normalized.suffix, object.size);
			offset = object.size - length;
		} else {
			offset = normalized.offset ?? 0;
			length = normalized.length ?? object.size - offset;
		}
		headers.set(
			"Content-Range",
			`bytes ${offset}-${offset + length - 1}/${object.size}`
		);
		headers.set("Content-Length", `${length}`);
		return new Response(body, { status: 206, headers });
	}

	headers.set("Content-Length", `${object.size}`);
	return new Response(body, { headers });
});

app.all("/:bucketId/:key{.+}", (c) => c.body(null, 401));

export default app;
