import assert from "assert";
import { TextDecoder } from "util";
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
import { R2Gateway, R2Objects } from "./gateway";
import { EncodedMetadata, R2Object, R2ObjectBody } from "./r2Object";
import { R2BindingRequestSchema } from "./schemas";

const decoder = new TextDecoder();

async function decodeMetadata(req: Request) {
	const bytes = await req.arrayBuffer();

	const metadataSize = Number(req.headers.get(CfHeader.MetadataSize));
	if (Number.isNaN(metadataSize)) {
		throw new InvalidMetadata();
	}

	const [metadataBytes, value] = [
		bytes.slice(0, metadataSize),
		bytes.slice(metadataSize),
	];
	const metadataText = decoder.decode(metadataBytes);
	const metadata = R2BindingRequestSchema.parse(JSON.parse(metadataText));
	return { metadata, value: new Uint8Array(value) };
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

export interface R2Params {
	bucket: string;
}

export class R2Router extends Router<R2Gateway> {
	@GET("/:bucket")
	get: RouteHandler<R2Params> = async (req, params) => {
		const metadata = decodeHeaderMetadata(req);
		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(params.bucket, persist);

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
		const { metadata, value } = await decodeMetadata(req);
		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(params.bucket, persist);

		if (metadata.method === "delete") {
			assert("object" in metadata);
			// TODO: support multiple delete
			await gateway.delete(metadata.object);
			return new Response();
		} else if (metadata.method === "put") {
			const result = await gateway.put(metadata.object, value, metadata);
			return encodeResult(result);
		} else {
			throw new InternalError(); // Unknown method: should never be reached
		}
	};
}
