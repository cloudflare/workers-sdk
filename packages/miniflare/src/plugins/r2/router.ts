import { TextDecoder } from "util";
import { Request, Response } from "undici";
import {
	GET,
	PUT,
	RouteHandler,
	Router,
	decodePersist,
	CfHeader,
} from "../shared";
import { InternalError, InvalidMetadata, R2Error } from "./errors";
import {
	R2Gateway,
	R2GetOptions,
	R2ListOptions,
	R2PutOptions,
} from "./gateway";
import { R2HTTPMetadata, R2Object } from "./r2Object";

export interface R2Params {
	bucket: string;
}
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
	const metadata = JSON.parse(decoder.decode(metadataBytes));
	return { metadata, value: new Uint8Array(value) };
}
function decodeHeaderMetadata(req: Request) {
	if (req.headers.get(CfHeader.Request) === null) {
		throw new InvalidMetadata();
	}
	return JSON.parse(req.headers.get(CfHeader.Request) as string);
}

export interface RawR2GetOptions {
	range?: {
		offset?: string;
		length?: string;
		suffix?: string;
	};
	onlyIf: {
		etagMatches?: string;
		etagDoesNotMatch?: string;
		uploadedBefore?: string;
		uploadedAfter?: string;
	};
}
export interface RawR2PutOptions {
	// Various HTTP headers associated with the object. Refer to
	// https://developers.cloudflare.com/r2/runtime-apis/#http-metadata.
	httpFields?: R2HTTPMetadata;
	// A map of custom, user-defined metadata that will be stored with the object.
	customFields?: { k: string; v: string }[];
	// A md5 hash to use to check the recieved object’s integrity.
	md5?: string;
}

export interface RawR2ListOptions {
	// The number of results to return. Defaults to 1000, with a maximum of 1000.
	limit?: number;
	// The prefix to match keys against. Keys will only be returned if they start with given prefix.
	prefix?: string;
	// An opaque token that indicates where to continue listing objects from.
	// A cursor can be retrieved from a previous list operation.
	cursor?: string;
	// The character to use when grouping keys.
	delimiter?: string;
	// Can include httpFields and/or customFields. If included, items returned by
	// the list will include the specified metadata. Note that there is a limit on the
	// total amount of data that a single list operation can return.
	// If you request data, you may recieve fewer than limit results in your response
	// to accomodate metadata.
	// Use the truncated property to determine if the list request has more data to be returned.
	include?: (0 | 1)[];
}
function parseGetOptions({
	range = {},
	onlyIf = {},
}: RawR2GetOptions): R2GetOptions {
	return {
		range: {
			offset: range?.offset ? Number(range?.offset) : undefined,
			length: range?.length ? Number(range?.length) : undefined,
			suffix: range?.suffix ? Number(range?.suffix) : undefined,
		},
		onlyIf: {
			etagMatches: onlyIf.etagMatches,
			etagDoesNotMatch: onlyIf.etagDoesNotMatch,
			uploadedAfter: onlyIf?.uploadedAfter
				? Number(onlyIf?.uploadedAfter)
				: undefined,
			uploadedBefore: onlyIf?.uploadedBefore
				? Number(onlyIf?.uploadedBefore)
				: undefined,
		},
	};
}

function parsePutOptions(options: RawR2PutOptions): R2PutOptions {
	return {
		...options,
		httpMetadata: options.httpFields ?? {},
		customMetadata: options.customFields
			? Object.fromEntries(options.customFields.map(({ k, v }) => [k, v]))
			: {},
	};
}

function parseListOptions(options: RawR2ListOptions): R2ListOptions {
	return {
		...options,
		include: options.include
			?.filter((i) => i === 1 || i === 0)
			.map((i) => (i === 0 ? "httpMetadata" : "customMetadata")),
	};
}

export class R2Router extends Router<R2Gateway> {
	@GET("/:bucket")
	get: RouteHandler<R2Params> = async (req, params) => {
		const { method, object, ...options } = decodeHeaderMetadata(req);

		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(params.bucket, persist);
		try {
			let val;
			if (method === "head") {
				val = await gateway.head(object);
			} else if (method === "get") {
				val = await gateway.get(object, parseGetOptions(options));
			} else if (method === "list") {
				val = await gateway.list(parseListOptions(options));
			}
			if (!val) {
				throw new InternalError();
			}

			if (val instanceof R2Object) {
				val = val.encode();
			} else {
				val = R2Object.encodeMultiple(val);
			}

			return new Response(val.value, {
				headers: {
					[CfHeader.MetadataSize]: `${val.metadataSize}`,
					"Content-Type": "application/json",
				},
			});
		} catch (e) {
			if (e instanceof R2Error) {
				return e.toResponse();
			}
			throw e;
		}
	};

	@PUT("/:bucket")
	put: RouteHandler<R2Params> = async (req, params) => {
		const { metadata, value } = await decodeMetadata(req);
		const persist = decodePersist(req.headers);
		const gateway = this.gatewayFactory.get(params.bucket, persist);

		try {
			if (metadata.method === "delete") {
				await gateway.delete(metadata.object);
				return new Response();
			} else if (metadata.method === "put") {
				return Response.json(
					await gateway.put(metadata.object, value, parsePutOptions(metadata))
				);
			}
			// Unknown method: should never be reached
			throw new InternalError();
		} catch (e) {
			if (e instanceof R2Error) {
				return e.toResponse();
			}
			throw e;
		}
	};
}
