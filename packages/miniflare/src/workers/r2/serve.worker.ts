// Accept only a single range with start <= end; reject anything else
// (including multiple ranges) with an endpoint-specific 400 rather than
// ignoring it
const RANGE_HEADER = /^bytes=(?:(\d+)-(\d+)?|-(\d+))$/;

export type ParsedRangeHeader =
	| { error: "malformed" | "inverted" | "unsatisfiable" }
	// `start` is undefined for suffix ranges (`bytes=-N`)
	| { start?: number };

export function parseRangeHeader(header: string): ParsedRangeHeader {
	const match = RANGE_HEADER.exec(header);
	if (match === null) {
		return { error: "malformed" };
	}
	const [, start, end, suffix] = match;
	if (start === undefined) {
		// A zero suffix length (`bytes=-0`) is unsatisfiable for any object;
		// the simulator would ignore the range and serve the full body
		return Number(suffix) === 0 ? { error: "unsatisfiable" } : {};
	}
	if (end !== undefined && Number(start) > Number(end)) {
		return { error: "inverted" };
	}
	return { start: Number(start) };
}

function objectHeaders(object: R2Object): Headers {
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	if (!headers.has("Content-Type")) {
		headers.set("Content-Type", "application/octet-stream");
	}
	headers.set("ETag", object.httpEtag);
	headers.set("Last-Modified", object.uploaded.toUTCString());
	headers.set("Accept-Ranges", "bytes");
	return headers;
}

export interface ServeHandlers {
	notFound(): Response | Promise<Response>;
	preconditionFailed(): Response;
	/**
	 * When provided, a range starting at or beyond the object size returns
	 * this error (like R2's S3 API). When omitted, the simulator's behavior
	 * of clamping the range applies.
	 */
	invalidRange?(): Response;
	/** Adds endpoint-specific headers to successful (2xx/304) responses */
	decorateHeaders?(object: R2Object, headers: Headers): void;
}

export async function serveR2Object(
	request: Request,
	bucket: R2Bucket,
	key: string,
	handlers: ServeHandlers,
	/** The caller's parse of the request's Range header, error-screened */
	parsedRange?: ParsedRangeHeader
): Promise<Response> {
	// R2 honors Range on HEAD too (206 + Content-Range, no body)
	const rangeHeader = request.headers.get("Range");
	const hasRange = rangeHeader !== null;

	// `bucket.head()` cannot evaluate conditional headers (the R2 head
	// operation only carries the key), so HEAD also uses `bucket.get()` and
	// discards the body.
	const object = await bucket.get(key, {
		onlyIf: request.headers,
		range: hasRange ? request.headers : undefined,
	});

	if (object === null) {
		return handlers.notFound();
	}

	const headers = objectHeaders(object);
	handlers.decorateHeaders?.(object, headers);

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
			const value = request.headers.get(name);
			if (value !== null) {
				preconditions ??= new Headers();
				preconditions.set(name, value);
			}
		}
		if (preconditions !== undefined) {
			const recheck = await bucket.get(key, { onlyIf: preconditions });
			if (recheck === null) {
				return handlers.notFound();
			}
			if (!("body" in recheck)) {
				return handlers.preconditionFailed();
			}
			// An unread recheck body would hold a read stream open
			void recheck.body.cancel();
		}

		// Otherwise, the preconditions hold, so the failure came from a cache
		// validator.
		return new Response(null, { status: 304, headers });
	}

	const body = request.method === "HEAD" ? null : object.body;
	if (body === null) {
		// An unread body would hold a read stream open
		void object.body.cancel();
	}

	const range = object.range;
	if (hasRange && range !== undefined) {
		// The simulator clamps out-of-bounds ranges and serves a zero-length
		// range for empty objects; R2 rejects both with 416 (any range on a
		// 0-byte object, or a range starting at or beyond the object size)
		if (handlers.invalidRange !== undefined) {
			const parsed = parsedRange ?? parseRangeHeader(rangeHeader);
			if (
				!("error" in parsed) &&
				(object.size === 0 ||
					(parsed.start !== undefined && parsed.start >= object.size))
			) {
				if (body !== null) {
					void body.cancel();
				}
				return handlers.invalidRange();
			}
		}
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
}
