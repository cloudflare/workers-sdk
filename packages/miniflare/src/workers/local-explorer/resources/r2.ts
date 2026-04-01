import {
	aggregateListResults,
	fetchFromPeer,
	getPeerUrlsIfAggregating,
} from "../aggregation";
import { errorResponse, wrapResponse } from "../common";
import type { AppContext } from "../common";
import type { Env } from "../explorer.worker";
import type {
	R2Bucket as R2BucketType,
	R2ListBucketsResponse,
} from "../generated";
import type {
	zR2BucketDeleteObjectsData,
	zR2BucketGetObjectData,
	zR2BucketListObjectsData,
	zR2BucketPutObjectData,
} from "../generated/zod.gen";
import type z from "zod";

// ============================================================================
// Error Codes (matching Cloudflare API)
// ============================================================================

/** Error code for bucket not found */
const R2_ERROR_BUCKET_NOT_FOUND = 10006;
/** Error code for object not found */
const R2_ERROR_OBJECT_NOT_FOUND = 10007;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get an R2 binding by bucket name
 */
function getR2Binding(env: Env, bucket_name: string): R2Bucket | null {
	const bindingMap = env.LOCAL_EXPLORER_BINDING_MAP.r2;

	// Find the binding name for this bucket
	const bindingName = bindingMap[bucket_name];
	if (!bindingName) return null;

	return env[bindingName] as R2Bucket;
}

async function findR2BucketOwner(
	c: AppContext,
	bucketName: string
): Promise<string | null> {
	const peerUrls = await getPeerUrlsIfAggregating(c);
	if (peerUrls.length === 0) return null;

	const responses = await Promise.all(
		peerUrls.map(async (url) => {
			const response = await fetchFromPeer(url, "/r2/buckets");
			if (!response?.ok) return null;
			const data = (await response.json()) as R2ListBucketsResponse;
			const found = data.result?.buckets?.some((b) => b.name === bucketName);
			return found ? url : null;
		})
	);

	return responses.find((url) => url !== null) ?? null;
}

/**
 * R2 bucket response extended with worker name for filtering in the UI.
 * We require `name` since we always have it locally.
 */
type R2BucketWithWorker = Required<Pick<R2BucketType, "name">> &
	Omit<R2BucketType, "name"> & {
		workerName: string;
	};

/**
 * Get local R2 buckets from the binding map.
 * Each bucket is tagged with the worker name it belongs to.
 */
function getLocalR2Buckets(env: Env): R2BucketWithWorker[] {
	const r2BindingMap = env.LOCAL_EXPLORER_BINDING_MAP.r2;

	return Object.entries(r2BindingMap).map(([bucketName, bindingName]) => {
		// Binding names follow the pattern "MINIFLARE_PROXY:r2:workerName:BINDING"
		const parts = bindingName.split(":");
		const workerName = parts.length >= 3 ? parts[2] : "unknown";

		return {
			name: bucketName,
			workerName,
		};
	});
}

// ============================================================================
// API Handlers
// ============================================================================

/**
 * List all R2 buckets across all connected instances.
 *
 * This is an aggregated endpoint - it fetches buckets from the local instance
 * and all peer instances in the dev registry, then merges the results.
 *
 * @see https://developers.cloudflare.com/api/resources/r2/subresources/buckets/methods/list/
 */
export async function listR2Buckets(c: AppContext) {
	const localBuckets = getLocalR2Buckets(c.env);
	const aggregatedBuckets = await aggregateListResults<{
		name: string;
		workerName: string;
	}>(c, localBuckets, "/r2/buckets", "buckets");

	// Deduplicate by name
	const localNames = new Set(localBuckets.map((b) => b.name));
	const allBuckets = aggregatedBuckets.filter(
		(b, index) => index < localBuckets.length || !localNames.has(b.name)
	);

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

	// Try local first
	const r2 = getR2Binding(c.env, bucket_name);
	if (r2) {
		return executeListObjects(r2, { prefix, delimiter, cursor, limit }, c);
	}

	const ownerMiniflare = await findR2BucketOwner(c, bucket_name);
	if (ownerMiniflare) {
		const params = new URLSearchParams();
		if (prefix) params.set("prefix", prefix);
		if (delimiter) params.set("delimiter", delimiter);
		if (cursor) params.set("cursor", cursor);
		if (limit !== undefined) params.set("per_page", String(limit));
		const queryString = params.toString();
		const path = `/r2/buckets/${encodeURIComponent(bucket_name)}/objects${
			queryString ? `?${queryString}` : ""
		}`;

		const response = await fetchFromPeer(ownerMiniflare, path);
		if (response) return response;
	}

	return errorResponse(
		404,
		R2_ERROR_BUCKET_NOT_FOUND,
		"list objects: 'bucket not found'"
	);
}

/**
 * Execute list objects on a local R2 binding.
 */
async function executeListObjects(
	r2: R2Bucket,
	options: {
		prefix?: string;
		delimiter?: string;
		cursor?: string;
		limit?: number;
	},
	c: AppContext
) {
	const listResult = await r2.list(options);

	const objects = listResult.objects.map((obj) => ({
		key: obj.key,
		etag: obj.etag,
		size: obj.size,
		last_modified: obj.uploaded.toISOString(),
		http_metadata: obj.httpMetadata
			? {
					contentType: obj.httpMetadata.contentType,
					contentLanguage: obj.httpMetadata.contentLanguage,
					contentDisposition: obj.httpMetadata.contentDisposition,
					contentEncoding: obj.httpMetadata.contentEncoding,
					cacheControl: obj.httpMetadata.cacheControl,
					cacheExpiry: obj.httpMetadata.cacheExpiry?.toISOString(),
				}
			: undefined,
		custom_metadata: obj.customMetadata,
	}));

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

	// Try local first
	const r2 = getR2Binding(c.env, bucket_name);
	if (r2) {
		if (metadataOnly) {
			const obj = await r2.head(object_key);
			if (obj === null) {
				return errorResponse(
					404,
					R2_ERROR_OBJECT_NOT_FOUND,
					"head: 'object not found'"
				);
			}
			return c.json(
				wrapResponse({
					key: obj.key,
					etag: obj.etag,
					last_modified: obj.uploaded.toISOString(),
					size: obj.size,
					http_metadata: obj.httpMetadata
						? {
								contentType: obj.httpMetadata.contentType,
								contentLanguage: obj.httpMetadata.contentLanguage,
								contentDisposition: obj.httpMetadata.contentDisposition,
								contentEncoding: obj.httpMetadata.contentEncoding,
								cacheControl: obj.httpMetadata.cacheControl,
								cacheExpiry: obj.httpMetadata.cacheExpiry?.toISOString(),
							}
						: undefined,
					custom_metadata: obj.customMetadata,
				})
			);
		}

		const obj = await r2.get(object_key);
		if (obj === null) {
			return errorResponse(
				404,
				R2_ERROR_OBJECT_NOT_FOUND,
				"get: 'object not found'"
			);
		}

		const responseHeaders = new Headers();
		if (obj.httpMetadata?.contentType) {
			responseHeaders.set("Content-Type", obj.httpMetadata.contentType);
		}
		responseHeaders.set("Content-Length", String(obj.size));
		responseHeaders.set("ETag", obj.etag);
		responseHeaders.set("Last-Modified", obj.uploaded.toUTCString());

		// Include custom metadata as headers
		if (obj.customMetadata) {
			for (const [key, value] of Object.entries(obj.customMetadata)) {
				responseHeaders.set(`X-R2-Custom-Metadata-${key}`, value);
			}
		}

		return new Response(obj.body, { headers: responseHeaders });
	}

	const ownerMiniflare = await findR2BucketOwner(c, bucket_name);
	if (ownerMiniflare) {
		const route = `/r2/buckets/${encodeURIComponent(
			bucket_name
		)}/objects/${encodeURIComponent(object_key)}`;
		const response = await fetchFromPeer(ownerMiniflare, route, {
			headers: metadataOnly ? { "cf-metadata-only": "true" } : undefined,
		});
		if (response) return response;
	}

	return errorResponse(
		404,
		R2_ERROR_BUCKET_NOT_FOUND,
		"get: 'bucket not found'"
	);
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
	// Try local first
	const r2 = getR2Binding(c.env, bucket_name);
	if (r2) {
		const body = await c.req.arrayBuffer();
		const contentType = headers["content-type"];
		const customMetadataHeader = headers["cf-r2-custom-metadata"];

		const options: R2PutOptions = {};
		if (contentType) {
			options.httpMetadata = { contentType };
		}
		if (customMetadataHeader) {
			try {
				options.customMetadata = JSON.parse(customMetadataHeader);
			} catch {
				return errorResponse(400, 10001, "Invalid custom metadata JSON");
			}
		}

		const obj = await r2.put(object_key, body, options);
		return c.json(
			wrapResponse({
				key: obj.key,
				etag: obj.etag,
				size: obj.size,
				version: obj.version,
			})
		);
	}

	const ownerMiniflare = await findR2BucketOwner(c, bucket_name);
	if (ownerMiniflare) {
		const body = await c.req.arrayBuffer();
		const fetchHeaders: Record<string, string> = {};
		if (headers["content-type"]) {
			fetchHeaders["content-type"] = headers["content-type"];
		}
		if (headers["cf-r2-custom-metadata"]) {
			fetchHeaders["cf-r2-custom-metadata"] = headers["cf-r2-custom-metadata"];
		}
		const path = `/r2/buckets/${encodeURIComponent(
			bucket_name
		)}/objects/${encodeURIComponent(object_key)}`;
		const response = await fetchFromPeer(ownerMiniflare, path, {
			method: "PUT",
			headers: fetchHeaders,
			body,
		});
		if (response) return response;
	}

	return errorResponse(
		404,
		R2_ERROR_BUCKET_NOT_FOUND,
		"put: 'bucket not found'"
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

	// Try local first
	const r2 = getR2Binding(c.env, bucket_name);
	if (r2) {
		await r2.delete(keys);
		return c.json(wrapResponse(keys.map((key) => ({ key }))));
	}

	const ownerMiniflare = await findR2BucketOwner(c, bucket_name);
	if (ownerMiniflare) {
		const path = `/r2/buckets/${encodeURIComponent(bucket_name)}/objects`;
		const response = await fetchFromPeer(ownerMiniflare, path, {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(keys),
		});
		if (response) return response;
	}

	return errorResponse(
		404,
		R2_ERROR_BUCKET_NOT_FOUND,
		"delete: 'bucket not found'"
	);
}
