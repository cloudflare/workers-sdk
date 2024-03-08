import assert from "node:assert";
import { Buffer } from "node:buffer";
import { sanitisePath } from "./data";
import { InclusiveRange } from "./range";

const ENCODER = new TextEncoder();

export async function readPrefix(
	stream: ReadableStream<Uint8Array>,
	prefixLength: number
): Promise<[prefix: Uint8Array, rest: ReadableStream]> {
	const reader = await stream.getReader({ mode: "byob" });
	const result = await reader.readAtLeast(
		prefixLength,
		new Uint8Array(prefixLength)
	);
	assert(result.value !== undefined);
	reader.releaseLock();
	// Without this `pipeThrough()`, getting uncaught `TypeError: Can't read from
	// request stream after response has been sent.`
	const rest = stream.pipeThrough(new IdentityTransformStream());
	return [result.value, rest];
}

function rangeHeaders(range: InclusiveRange) {
	return { Range: `bytes=${range.start}-${range.end}` };
}

function assertFullRangeRequest(range: InclusiveRange, contentLength: number) {
	assert(
		range.start === 0 && range.end === contentLength - 1,
		"Received full content, but requested partial content"
	);
}

async function fetchSingleRange(
	fetcher: Fetcher,
	url: URL,
	range?: InclusiveRange
): Promise<ReadableStream | null> {
	const headers: HeadersInit = range === undefined ? {} : rangeHeaders(range);
	const res = await fetcher.fetch(url, { headers });

	// If we couldn't find the resource, return `null`
	if (res.status === 404) return null;

	// Otherwise, make sure we have the expected response, and return the body
	assert(res.ok && res.body !== null);
	if (range !== undefined && res.status !== 206) {
		// If we specified a range, but received full content, make sure the range
		// covered the full content
		// Safety of `!`: `parseInt(null)` is `NaN`
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const contentLength = parseInt(res.headers.get("Content-Length")!);
		assert(!Number.isNaN(contentLength));
		assertFullRangeRequest(range, contentLength);
	}
	return res.body;
}

export interface MultipartOptions {
	contentType?: string;
}
export interface MultipartReadableStream {
	multipartContentType: string;
	body: ReadableStream<Uint8Array>;
}
async function writeMultipleRanges(
	fetcher: Fetcher,
	url: URL,
	ranges: InclusiveRange[],
	boundary: string,
	writable: WritableStream,
	contentLength: number,
	contentType?: string
): Promise<void> {
	for (let i = 0; i < ranges.length; i++) {
		const range = ranges[i];
		const writer = writable.getWriter();
		// If this isn't the first thing we've written, we'll need to prepend CRLF
		if (i > 0) await writer.write(ENCODER.encode("\r\n"));
		// Write boundary and headers
		await writer.write(ENCODER.encode(`--${boundary}\r\n`));
		if (contentType !== undefined) {
			await writer.write(ENCODER.encode(`Content-Type: ${contentType}\r\n`));
		}
		const start = range.start;
		const end = Math.min(range.end, contentLength - 1);
		await writer.write(
			ENCODER.encode(
				`Content-Range: bytes ${start}-${end}/${contentLength}\r\n\r\n`
			)
		);
		writer.releaseLock();
		// Fetch and write the range
		const res = await fetcher.fetch(url, { headers: rangeHeaders(range) });
		assert(
			res.ok && res.body !== null,
			`Failed to fetch ${url}[${range.start},${range.end}], received ${res.status} ${res.statusText}`
		);
		// If we specified a range, but received full content, make sure the range
		// covered the full content
		if (res.status !== 206) assertFullRangeRequest(range, contentLength);
		await res.body.pipeTo(writable, { preventClose: true });
	}
	// Finished writing all ranges, now write the trailer
	const writer = writable.getWriter();
	if (ranges.length > 0) await writer.write(ENCODER.encode("\r\n"));
	await writer.write(ENCODER.encode(`--${boundary}--`));
	await writer.close();
}
async function fetchMultipleRanges(
	fetcher: Fetcher,
	url: URL,
	ranges: InclusiveRange[],
	opts?: MultipartOptions
): Promise<MultipartReadableStream | null> {
	// Check resource exists, and get content length
	const res = await fetcher.fetch(url, { method: "HEAD" });
	if (res.status === 404) return null;
	assert(res.ok);

	// Safety of `!`: `parseInt(null)` is `NaN`
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const contentLength = parseInt(res.headers.get("Content-Length")!);
	assert(!Number.isNaN(contentLength));

	// See https://developer.mozilla.org/en-US/docs/Web/HTTP/Range_requests#multipart_ranges
	// for details on `multipart/byteranges` responses
	const boundary = `miniflare-boundary-${crypto.randomUUID()}`;
	const multipartContentType = `multipart/byteranges; boundary=${boundary}`;
	const { readable, writable } = new IdentityTransformStream();
	void writeMultipleRanges(
		fetcher,
		url,
		ranges,
		boundary,
		writable,
		contentLength,
		opts?.contentType
	).catch((e) => console.error("Error writing multipart stream:", e));
	return { multipartContentType, body: readable };
}

async function fetchRange(
	fetcher: Fetcher,
	url: URL,
	range?: InclusiveRange | InclusiveRange[],
	opts?: MultipartOptions
): Promise<ReadableStream<Uint8Array> | MultipartReadableStream | null> {
	if (Array.isArray(range)) {
		return fetchMultipleRanges(fetcher, url, range, opts);
	} else {
		return fetchSingleRange(fetcher, url, range);
	}
}

function generateBlobId(): BlobId {
	const idBuffer = Buffer.alloc(40);
	crypto.getRandomValues(
		new Uint8Array(idBuffer.buffer, idBuffer.byteOffset, 32)
	);
	idBuffer.writeBigInt64BE(
		BigInt(performance.timeOrigin + performance.now()),
		32
	);
	return idBuffer.toString("hex");
}

// Serialisable, opaque, unguessable blob identifier
export type BlobId = string;
export class BlobStore {
	// Database for binary large objects. Provides single and multi-ranged
	// streaming reads and writes.
	//
	// Blobs have unguessable identifiers, can be deleted, but are otherwise
	// immutable. These properties make it possible to perform atomic updates with
	// the SQLite metadata store. No other operations will be able to interact
	// with the blob until it's committed to the metadata store, because they
	// won't be able to guess the ID, and we don't allow listing blobs.
	//
	// For example, if we put a blob in the store, then fail to insert the blob ID
	// into the SQLite database for some reason during a transaction (e.g.
	// `onlyIf` condition failed), no other operations can read that blob because
	// the ID is lost (we'll just background-delete the blob in this case).

	readonly #fetcher: Fetcher;
	readonly #baseURL: string;
	readonly #stickyBlobs: boolean;

	constructor(fetcher: Fetcher, namespace: string, stickyBlobs: boolean) {
		namespace = encodeURIComponent(sanitisePath(namespace));
		this.#fetcher = fetcher;
		// `baseURL`'s `pathname` (`/${namespace}/blobs/`) is relative to the
		// `*Persist` (e.g. `kvPersist`) option if defined. For example, if
		// `kvPersist` is `/path/to/kv`, the `blobs` directory for a KV namespace
		// with ID `TEST_NAMESPACE` would be `/path/to/kv/TEST_NAMESPACE/blobs`.
		this.#baseURL = `http://placeholder/${namespace}/blobs/`;
		this.#stickyBlobs = stickyBlobs;
	}

	private idURL(id: BlobId) {
		const url = new URL(this.#baseURL + id);
		return url.toString().startsWith(this.#baseURL) ? url : null;
	}

	get(
		id: BlobId,
		range?: InclusiveRange
	): Promise<ReadableStream<Uint8Array> | null>;
	get(
		id: BlobId,
		ranges: InclusiveRange[],
		opts?: MultipartOptions
	): Promise<MultipartReadableStream | null>;
	async get(
		id: BlobId,
		range?: InclusiveRange | InclusiveRange[],
		opts?: MultipartOptions
	): Promise<ReadableStream<Uint8Array> | MultipartReadableStream | null> {
		// Get path for this ID, returning null if it's outside the root
		const idURL = this.idURL(id);
		if (idURL === null) return null;
		// Get correct response for range, returning null if not found
		return fetchRange(this.#fetcher, idURL, range, opts);
	}

	async put(stream: ReadableStream<Uint8Array>): Promise<BlobId> {
		const id = generateBlobId();

		// Get path for this ID, this should never be null as blob IDs are encoded
		const idURL = this.idURL(id);
		assert(idURL !== null);
		// Write stream to file
		// TODO(someday): add support for exclusive flag to assert new file creation
		// TODO(someday): add support for marking file read-only
		await this.#fetcher.fetch(idURL, {
			method: "PUT",
			body: stream,
		});

		return id;
	}

	async delete(id: BlobId): Promise<void> {
		// If sticky blobs are enabled, don't delete any blobs
		if (this.#stickyBlobs) return;
		// Get path for this ID and delete, ignoring if outside root or not found
		const idURL = this.idURL(id);
		if (idURL === null) return;
		const res = await this.#fetcher.fetch(idURL, { method: "DELETE" });
		assert(res.ok || res.status === 404);
	}
}
