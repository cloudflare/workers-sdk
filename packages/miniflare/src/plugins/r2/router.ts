import assert from "assert";
import { ReadableStream } from "stream/web";
import { Request, Response } from "../../http";
import { readPrefix } from "../../shared";
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
import {
	EncodedMetadata,
	InternalR2Object,
	InternalR2ObjectBody,
	InternalR2Objects,
} from "./r2Object";
import { R2BindingRequestSchema } from "./schemas";

async function decodeMetadata(req: Request) {
	const metadataSize = Number(req.headers.get(CfHeader.MetadataSize));
	if (Number.isNaN(metadataSize)) throw new InvalidMetadata();

	assert(req.body !== null);
	const body = req.body as ReadableStream<Uint8Array>;

	// Read just metadata from body stream
	const [metadataBuffer, value] = await readPrefix(body, metadataSize);
	const metadataJson = metadataBuffer.toString();
	const metadata = R2BindingRequestSchema.parse(JSON.parse(metadataJson));

	return { metadata, metadataSize, value };
}
function decodeHeaderMetadata(req: Request) {
	const header = req.headers.get(CfHeader.Request);
	if (header === null) throw new InvalidMetadata();
	return R2BindingRequestSchema.parse(JSON.parse(header));
}

function encodeResult(
	result: InternalR2Object | InternalR2ObjectBody | InternalR2Objects
) {
	let encoded: EncodedMetadata;
	if (result instanceof InternalR2Object) {
		encoded = result.encode();
	} else {
		encoded = InternalR2Object.encodeMultiple(result);
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

		let result: InternalR2Object | InternalR2ObjectBody | InternalR2Objects;
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
