import assert from "assert";
import { ReadableStream, TransformStream } from "stream/web";
import { Request, Response } from "../../http";
import {
	CfHeader,
	GET,
	PUT,
	RouteHandler,
	Router,
	decodePersist,
} from "../shared";
import { InternalError, InvalidMetadata } from "./errors";
import { R2Gateway } from "./gateway";
import { EncodedMetadata, R2Object, R2ObjectBody, R2Objects } from "./r2Object";
import { R2BindingRequestSchema } from "./schemas";

async function decodeMetadata(req: Request) {
	const metadataSize = Number(req.headers.get(CfHeader.MetadataSize));
	if (Number.isNaN(metadataSize)) throw new InvalidMetadata();

	assert(req.body !== null);
	const body = req.body as ReadableStream<Uint8Array>;

	// Read just metadata from body stream (NOTE: we can't use a `TransformStream`
	// and buffer the first N chunks as we need this metadata to determine what
	// to do with the rest of the body. We have to *pull* the data as opposed to
	// passively transforming it as it's piped somewhere else. If `body` were
	// a byte stream, we could use BYOB reads to read just enough. Even better, if
	// this were running in the Workers runtime, we could use `readAtLeast()` to
	// read everything at once.)
	const chunks: Uint8Array[] = [];
	let chunksLength = 0;
	for await (const chunk of body.values({ preventCancel: true })) {
		chunks.push(chunk);
		chunksLength += chunk.byteLength;
		// Once we've read enough bytes, stop
		if (chunksLength >= metadataSize) break;
	}
	// If we read the entire stream without enough bytes for metadata, throw
	if (chunksLength < metadataSize) throw new InvalidMetadata();
	const atLeastMetadata = Buffer.concat(chunks, chunksLength);
	const metadataJson = atLeastMetadata.subarray(0, metadataSize).toString();
	const metadata = R2BindingRequestSchema.parse(JSON.parse(metadataJson));

	let value = body;
	// If we read some value when reading metadata (quite likely), create a new
	// stream, write the bit we read, then write the rest of the body stream
	if (chunksLength > metadataSize) {
		const identity = new TransformStream<Uint8Array, Uint8Array>();
		const writer = identity.writable.getWriter();
		// The promise returned by `writer.write()` will only resolve once the chunk
		// is read, which won't be until after this function returns, so we can't
		// use `await` here
		void writer.write(atLeastMetadata.subarray(metadataSize)).then(() => {
			// Release the writer without closing the stream
			writer.releaseLock();
			return body.pipeTo(identity.writable);
		});
		value = identity.readable;
	}

	return { metadata, metadataSize, value };
}
function decodeHeaderMetadata(req: Request) {
	const header = req.headers.get(CfHeader.Request);
	if (header === null) throw new InvalidMetadata();
	return R2BindingRequestSchema.parse(JSON.parse(header));
}

function encodeResult(result: R2Object | R2ObjectBody | R2Objects) {
	let encoded: EncodedMetadata;
	if (result instanceof R2Object) {
		encoded = result.encode();
	} else {
		encoded = R2Object.encodeMultiple(result);
	}

	return new Response(encoded.value, {
		headers: {
			[CfHeader.MetadataSize]: `${encoded.metadataSize}`,
			"Content-Type": "application/json",
		},
	});
}

function encodeJSONResult(result: unknown) {
	const encoded = JSON.stringify(result);
	return new Response(encoded, {
		headers: {
			[CfHeader.MetadataSize]: `${Buffer.byteLength(encoded)}`,
			"Content-Type": "application/json",
		},
	});
}

export interface R2Params {
	bucket: string;
}

export class R2Router extends Router<R2Gateway> {
	@GET("/:bucket")
	get: RouteHandler<R2Params> = async (req, params) => {
		const metadata = decodeHeaderMetadata(req);
		const persist = decodePersist(req.headers);
		const bucket = decodeURIComponent(params.bucket);
		const gateway = this.gatewayFactory.get(bucket, persist);

		let result: R2Object | R2ObjectBody | R2Objects;
		if (metadata.method === "head") {
			result = await gateway.head(metadata.object);
		} else if (metadata.method === "get") {
			result = await gateway.get(metadata.object, metadata);
		} else if (metadata.method === "list") {
			result = await gateway.list(metadata);
		} else {
			throw new InternalError();
		}

		return encodeResult(result);
	};

	@PUT("/:bucket")
	put: RouteHandler<R2Params> = async (req, params) => {
		const { metadata, metadataSize, value } = await decodeMetadata(req);
		const persist = decodePersist(req.headers);
		const bucket = decodeURIComponent(params.bucket);
		const gateway = this.gatewayFactory.get(bucket, persist);

		if (metadata.method === "delete") {
			await gateway.delete(
				"object" in metadata ? metadata.object : metadata.objects
			);
			return new Response();
		} else if (metadata.method === "put") {
			const contentLength = Number(req.headers.get("Content-Length"));
			// `workerd` requires a known value size for R2 put requests:
			// - https://github.com/cloudflare/workerd/blob/e3479895a2ace28e4fd5f1399cea4c92291966ab/src/workerd/api/r2-rpc.c%2B%2B#L154-L156
			// - https://github.com/cloudflare/workerd/blob/e3479895a2ace28e4fd5f1399cea4c92291966ab/src/workerd/api/r2-rpc.c%2B%2B#L188-L189
			assert(!isNaN(contentLength));
			const valueSize = contentLength - metadataSize;
			const result = await gateway.put(
				metadata.object,
				value,
				valueSize,
				metadata
			);
			return encodeResult(result);
		} else if (metadata.method === "createMultipartUpload") {
			const result = await gateway.createMultipartUpload(
				metadata.object,
				metadata
			);
			return encodeJSONResult(result);
		} else if (metadata.method === "uploadPart") {
			const contentLength = Number(req.headers.get("Content-Length"));
			// `workerd` requires a known value size for R2 put requests as above
			assert(!isNaN(contentLength));
			const valueSize = contentLength - metadataSize;
			const result = await gateway.uploadPart(
				metadata.object,
				metadata.uploadId,
				metadata.partNumber,
				value,
				valueSize
			);
			return encodeJSONResult(result);
		} else if (metadata.method === "completeMultipartUpload") {
			const result = await gateway.completeMultipartUpload(
				metadata.object,
				metadata.uploadId,
				metadata.parts
			);
			return encodeResult(result);
		} else if (metadata.method === "abortMultipartUpload") {
			await gateway.abortMultipartUpload(metadata.object, metadata.uploadId);
			return new Response();
		} else {
			throw new InternalError(); // Unknown method: should never be reached
		}
	};
}
