import { R2Headers } from "../../r2/constants";
import { readPrefix } from "../../shared/blob.worker";
import { SharedHeaders } from "../../shared/constants";
import { aggregateListResults } from "../aggregation";
import { errorResponse, wrapResponse } from "../common";
import type {
	R2DeleteRequestSchema,
	R2ErrorResponse,
	R2GetRequestSchema,
	R2HeadResponse,
	R2HeadRequestSchema,
	R2ListRequestSchema,
	R2ListResponse,
	R2PutRequestSchema,
} from "../../r2/schemas.worker";
import type { AppContext } from "../common";
import type { Env } from "../explorer.worker";
import type { R2Bucket as R2BucketType } from "../generated";
import type {
	zR2BucketDeleteObjectsData,
	zR2BucketGetObjectData,
	zR2BucketListObjectsData,
	zR2BucketPutObjectData,
} from "../generated/zod.gen";
import type z from "zod";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type R2PutRequest =
	| z.input<typeof R2PutRequestSchema>
	| z.input<typeof R2DeleteRequestSchema>;

type R2GetRequest =
	| z.input<typeof R2HeadRequestSchema>
	| z.input<typeof R2GetRequestSchema>
	| z.input<typeof R2ListRequestSchema>;

interface DecodedR2Response<T> {
	metadata: T;
	body: ReadableStream;
}

// ============================================================================
// Helper Functions
// ============================================================================

async function sendR2GetRequest(
	c: AppContext,
	bucketName: string,
	request: R2GetRequest
): Promise<Response> {
	return c.env.MINIFLARE_R2.fetch("http://r2/", {
		headers: {
			[SharedHeaders.NAMESPACE]: bucketName,
			[R2Headers.REQUEST]: JSON.stringify({ version: 1, ...request }),
		},
	});
}

async function sendR2PutRequest(
	c: AppContext,
	bucketName: string,
	request: R2PutRequest,
	value?: ArrayBuffer
): Promise<Response> {
	const metadata = encoder.encode(JSON.stringify({ version: 1, ...request }));
	const body = new Uint8Array(metadata.byteLength + (value?.byteLength ?? 0));
	body.set(metadata);
	if (value !== undefined) {
		body.set(new Uint8Array(value), metadata.byteLength);
	}
	return c.env.MINIFLARE_R2.fetch("http://r2/", {
		method: "PUT",
		headers: {
			"Content-Length": String(body.byteLength),
			[SharedHeaders.NAMESPACE]: bucketName,
			[R2Headers.METADATA_SIZE]: String(metadata.byteLength),
		},
		body,
	});
}

function toR2ErrorResponse(response: Response): Response {
	const encoded = response.headers.get(R2Headers.ERROR);
	if (encoded !== null) {
		try {
			const error = JSON.parse(encoded) as R2ErrorResponse;
			return errorResponse(response.status, error.v4code, error.message);
		} catch {}
	}
	return errorResponse(
		response.status,
		10000,
		response.statusText || "Internal R2 request failed"
	);
}

async function decodeR2Response<T>(
	response: Response
): Promise<DecodedR2Response<T>> {
	const metadataSize = Number(response.headers.get(R2Headers.METADATA_SIZE));
	if (!Number.isInteger(metadataSize) || metadataSize < 0) {
		throw new Error("R2 response did not contain a valid metadata size");
	}
	if (response.body === null) {
		throw new Error("R2 response did not contain a body");
	}
	const [metadata, body] = await readPrefix(response.body, metadataSize);
	return {
		metadata: JSON.parse(decoder.decode(metadata)) as T,
		body,
	};
}

function decodeCustomMetadata(
	fields: R2HeadResponse["customFields"]
): Record<string, string> | undefined {
	return fields === undefined
		? undefined
		: Object.fromEntries(fields.map(({ k, v }) => [k, v]));
}

function toExplorerObject(object: R2HeadResponse) {
	return {
		key: object.name,
		etag: object.etag,
		size: object.size,
		last_modified: new Date(object.uploaded).toISOString(),
		http_metadata:
			object.httpFields === undefined
				? undefined
				: {
						...object.httpFields,
						cacheExpiry:
							object.httpFields.cacheExpiry === undefined
								? undefined
								: new Date(object.httpFields.cacheExpiry).toISOString(),
					},
		custom_metadata: decodeCustomMetadata(object.customFields),
	};
}

/**
 * Get local R2 buckets from the binding map.
 */
function getLocalR2Buckets(env: Env): Required<Pick<R2BucketType, "name">>[] {
	const r2BindingMap = env.LOCAL_EXPLORER_BINDING_MAP.r2;

	return Object.entries(r2BindingMap).map(([bucketName]) => {
		return {
			name: bucketName,
		};
	});
}

// ============================================================================
// API Handlers
// ============================================================================

/**
 * List all local R2 buckets and buckets configured by shared-storage peers.
 *
 * Shared-storage peers are scoped by their canonical persistence root.
 *
 * @see https://developers.cloudflare.com/api/resources/r2/subresources/buckets/methods/list/
 */
export async function listR2Buckets(c: AppContext) {
	const localBuckets = getLocalR2Buckets(c.env);
	const allBuckets = await aggregateListResults<{
		name: string;
	}>(c, localBuckets, "/r2/buckets", {
		getKey: (bucket) => bucket.name,
		resultKey: "buckets",
		sharedStorageOnly: true,
	});

	// Sort by name
	allBuckets.sort((a, b) => a.name.localeCompare(b.name));

	return c.json({
		...wrapResponse({ buckets: allBuckets }),
		result_info: {
			count: allBuckets.length,
		},
	});
}

type ListObjectsQuery = NonNullable<
	z.output<typeof zR2BucketListObjectsData>["query"]
>;

/**
 * List objects in an R2 bucket with optional directory navigation.
 *
 * Supports:
 * - `prefix`: Filter objects by prefix (e.g., "folder1/")
 * - `delimiter`: Use "/" for directory-style navigation
 * - `cursor`: Pagination cursor
 * - `per_page`: Max results per page (default 1000)
 *
 * @see https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/objects/methods/list/
 */
export async function listR2Objects(
	c: AppContext,
	bucket_name: string,
	query: ListObjectsQuery
) {
	const prefix = query.prefix;
	const delimiter = query.delimiter;
	const cursor = query.cursor;
	const limit = query.per_page;

	const response = await sendR2GetRequest(c, bucket_name, {
		method: "list",
		prefix,
		delimiter,
		cursor,
		limit,
		// Matches workerd when the r2_list_honor_include compat flag is enabled
		// and the caller does not specify an include list.
		include: [],
	});
	if (!response.ok) {
		return toR2ErrorResponse(response);
	}
	const { metadata: listResult } =
		await decodeR2Response<R2ListResponse>(response);
	const objects = listResult.objects.map(toExplorerObject);

	return c.json({
		...wrapResponse(objects),
		result_info: {
			delimited: listResult.delimitedPrefixes,
			cursor: listResult.truncated ? listResult.cursor : undefined,
			is_truncated: listResult.truncated ? "true" : "false",
		},
	});
}

type GetObjectHeaders = NonNullable<
	z.output<typeof zR2BucketGetObjectData>["headers"]
>;

/**
 * Get an R2 object (content or metadata only).
 *
 * If the `cf-metadata-only` header is set to "true", only metadata is returned.
 * Otherwise, the full object content is returned.
 *
 * @see https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/objects/methods/get/
 */
export async function getR2Object(
	c: AppContext,
	bucket_name: string,
	object_key: string,
	headers: GetObjectHeaders
) {
	const metadataOnly = headers["cf-metadata-only"] === "true";
	const response = await sendR2GetRequest(c, bucket_name, {
		method: metadataOnly ? "head" : "get",
		object: object_key,
	});
	if (!response.ok) {
		return toR2ErrorResponse(response);
	}
	const { metadata: object, body } =
		await decodeR2Response<R2HeadResponse>(response);
	const explorerObject = toExplorerObject(object);
	if (metadataOnly) {
		return c.json(wrapResponse(explorerObject));
	}

	const responseHeaders = new Headers();
	if (object.httpFields?.contentType !== undefined) {
		responseHeaders.set("Content-Type", object.httpFields.contentType);
	}
	responseHeaders.set("Content-Length", String(object.size));
	responseHeaders.set("ETag", object.etag);
	responseHeaders.set("Last-Modified", new Date(object.uploaded).toUTCString());
	for (const [key, value] of Object.entries(
		decodeCustomMetadata(object.customFields) ?? {}
	)) {
		responseHeaders.set(`X-R2-Custom-Metadata-${key}`, value);
	}
	return new Response(body, { headers: responseHeaders });
}

type PutObjectHeaders = NonNullable<
	z.output<typeof zR2BucketPutObjectData>["headers"]
>;

/**
 * Put an object into an R2 bucket.
 *
 * Accepts:
 * - Body: Raw file content
 * - `Content-Type` header: File MIME type
 * - `cf-r2-custom-metadata` header: JSON-encoded custom metadata
 *
 * @see https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/objects/methods/put/
 */
export async function putR2Object(
	c: AppContext,
	bucket_name: string,
	object_key: string,
	headers: PutObjectHeaders
) {
	const body = await c.req.arrayBuffer();
	const contentType = headers["content-type"];
	const customMetadataHeader = headers["cf-r2-custom-metadata"];
	let customFields: { k: string; v: string }[] | undefined;
	if (customMetadataHeader !== undefined) {
		try {
			const customMetadata = JSON.parse(customMetadataHeader) as Record<
				string,
				string
			>;
			customFields = Object.entries(customMetadata).map(([k, v]) => ({ k, v }));
		} catch {
			return errorResponse(400, 10001, "Invalid custom metadata JSON");
		}
	}

	const response = await sendR2PutRequest(
		c,
		bucket_name,
		{
			method: "put",
			object: object_key,
			httpFields: contentType === undefined ? undefined : { contentType },
			customFields,
		},
		body
	);
	if (!response.ok) {
		return toR2ErrorResponse(response);
	}
	const { metadata: object } = await decodeR2Response<R2HeadResponse>(response);
	return c.json(
		wrapResponse({
			key: object.name,
			etag: object.etag,
			size: object.size,
			version: object.version,
		})
	);
}

type DeleteObjectsBody = z.output<typeof zR2BucketDeleteObjectsData>["body"];

/**
 * Delete one or more objects from an R2 bucket.
 *
 * Accepts an array of object keys to delete.
 *
 * @see https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/objects/methods/delete/
 */
export async function deleteR2Objects(
	c: AppContext,
	bucket_name: string,
	body: DeleteObjectsBody
): Promise<Response> {
	const keys = body;
	if (keys.length === 0) {
		return errorResponse(
			400,
			10001,
			"Request body must be a non-empty array of keys"
		);
	}

	const response = await sendR2PutRequest(c, bucket_name, {
		method: "delete",
		objects: keys,
	});
	if (!response.ok) {
		return toR2ErrorResponse(response);
	}
	return c.json(wrapResponse(keys.map((key) => ({ key }))));
}
