import { KVHeaders, KVParams } from "../../kv/constants";
import { SharedHeaders } from "../../shared/constants";
import { aggregateListResults } from "../aggregation";
import { errorResponse, wrapResponse } from "../common";
import type { AppContext } from "../common";
import type { Env } from "../explorer.worker";
import type { WorkersKvNamespace } from "../generated";
import type {
	zWorkersKvNamespaceGetMultipleKeyValuePairsData,
	zWorkersKvNamespaceListANamespaceSKeysData,
	zWorkersKvNamespaceListNamespacesData,
} from "../generated/zod.gen";
import type z from "zod";

// ============================================================================
// Error Codes (matching Cloudflare API)
// ============================================================================

/** Error code for key not found in KV namespace */
const KV_ERROR_KEY_NOT_FOUND = 10009;
// ============================================================================
// Helper Functions
// ============================================================================

interface KVListResult {
	keys: Array<{
		name: string;
		expiration?: number;
		metadata?: string;
	}>;
	list_complete: boolean;
	cursor?: string;
}

function getKVKeyUrl(keyName: string): URL {
	const url = new URL(`http://kv/${encodeURIComponent(keyName)}`);
	url.searchParams.set(KVParams.URL_ENCODED, "true");
	return url;
}

async function sendKVRequest(
	c: AppContext,
	namespaceId: string,
	url: URL | string,
	init?: RequestInit
): Promise<Response> {
	const headers = new Headers(init?.headers);
	headers.set(SharedHeaders.NAMESPACE, namespaceId);
	return c.env.MINIFLARE_KV.fetch(url, { ...init, headers });
}

async function toKVErrorResponse(
	response: Response,
	code = 10000
): Promise<Response> {
	const message = await response.text();
	return errorResponse(
		response.status,
		code,
		message || response.statusText || "Internal KV request failed"
	);
}

/**
 * Get local KV namespaces from the binding map.
 */
function getLocalKVNamespaces(env: Env): WorkersKvNamespace[] {
	const kvBindingMap = env.LOCAL_EXPLORER_BINDING_MAP.kv;

	return Object.entries(kvBindingMap).map(([id, bindingName]) => {
		const parts = bindingName.split(":");
		const title = parts.pop() || bindingName;

		return {
			id,
			title,
		};
	});
}

// ============================================================================
// API Handlers
// ============================================================================

type ListNamespacesQuery = NonNullable<
	z.output<typeof zWorkersKvNamespaceListNamespacesData>["query"]
>;

/**
 * List all local KV namespaces and namespaces configured by shared-storage peers.
 *
 * Shared-storage peers are scoped by their canonical persistence root.
 *
 * Supports sorting via `direction` and `order` query parameters.
 *
 * @see https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/methods/list/
 */
export async function listKVNamespaces(
	c: AppContext,
	query: ListNamespacesQuery
) {
	const direction = query.direction ?? "asc";
	const order = query.order ?? "id";

	const localNamespaces = getLocalKVNamespaces(c.env);
	const allNamespaces = await aggregateListResults(
		c,
		localNamespaces,
		"/storage/kv/namespaces",
		{ getKey: (namespace) => namespace.id, sharedStorageOnly: true }
	);

	// Sort results
	allNamespaces.sort((a, b) => {
		const aVal = order === "id" ? a.id : a.title;
		const bVal = order === "id" ? b.id : b.title;
		const cmp = aVal.localeCompare(bVal);
		return direction === "asc" ? cmp : -cmp;
	});

	return c.json({
		...wrapResponse(allNamespaces),
		result_info: {
			count: allNamespaces.length,
		},
	});
}

type ListKeysQuery = NonNullable<
	z.output<typeof zWorkersKvNamespaceListANamespaceSKeysData>["query"]
>;
/**
 * List a Namespace's Keys
 *
 * This endpoint keeps pagination as-is since it operates on a single namespace.
 *
 * @see https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/subresources/keys/methods/list/
 */
export async function listKVKeys(c: AppContext, query: ListKeysQuery) {
	const namespace_id = c.req.param("namespace_id");
	if (!namespace_id) {
		return errorResponse(400, 10000, "Missing namespace_id parameter");
	}
	const cursor = query.cursor;
	const limit = query.limit;
	const prefix = query.prefix;

	const url = new URL("http://kv/");
	if (cursor !== undefined) {
		url.searchParams.set(KVParams.LIST_CURSOR, cursor);
	}
	if (limit !== undefined && limit > 0) {
		url.searchParams.set(KVParams.LIST_LIMIT, String(limit));
	}
	if (prefix !== undefined) {
		url.searchParams.set(KVParams.LIST_PREFIX, prefix);
	}
	const response = await sendKVRequest(c, namespace_id, url);
	if (!response.ok) {
		return toKVErrorResponse(response);
	}
	const listResult = (await response.json()) as KVListResult;

	return c.json({
		...wrapResponse(
			listResult.keys.map((key) => ({
				name: key.name,
				expiration: key.expiration,
				metadata:
					key.metadata === undefined ? undefined : JSON.parse(key.metadata),
			}))
		),
		result_info: {
			count: listResult.keys.length,
			cursor: listResult.cursor ?? "",
		},
	});
}

/**
 * Read key-value pair
 *
 * @see https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/subresources/values/methods/get/
 */
export async function getKVValue(
	c: AppContext,
	namespaceId: string,
	keyName: string
) {
	const response = await sendKVRequest(c, namespaceId, getKVKeyUrl(keyName));
	if (!response.ok) {
		return toKVErrorResponse(
			response,
			response.status === 404 ? KV_ERROR_KEY_NOT_FOUND : 10000
		);
	}
	// This specific API doesn't wrap the response in the envelope.
	return new Response(response.body);
}

/**
 * Write key-value pair with optional metadata
 *
 * @see https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/subresources/values/methods/update/
 */
export async function putKVValue(
	c: AppContext,
	namespaceId: string,
	keyName: string
) {
	let value: ArrayBuffer | string;
	let metadata: unknown | undefined;

	const contentType = c.req.header("content-type") || "";

	// Multipart form data is used when including metadata
	// octect-stream is used when you don't need metadata
	if (contentType.includes("multipart/form-data")) {
		const formData = await c.req.formData();
		const formValue = formData.get("value");
		const formMetadata = formData.get("metadata");

		if (formValue instanceof Blob) {
			// Handle File or Blob
			value = await formValue.arrayBuffer();
		} else if (typeof formValue === "string") {
			value = formValue;
		} else if (formValue === null) {
			return errorResponse(400, 10001, "Missing value field");
		} else {
			return errorResponse(400, 10001, "Unsupported value type in form data");
		}

		if (formMetadata instanceof Blob) {
			const metadataText = await formMetadata.text();
			try {
				metadata = JSON.parse(metadataText);
			} catch {
				return errorResponse(400, 10001, "Invalid metadata JSON");
			}
		} else if (typeof formMetadata === "string") {
			try {
				metadata = JSON.parse(formMetadata);
			} catch {
				return errorResponse(400, 10001, "Invalid metadata JSON");
			}
		}
	} else {
		value = await c.req.arrayBuffer();
	}

	const headers = new Headers();
	if (metadata !== undefined) {
		headers.set(KVHeaders.METADATA, JSON.stringify(metadata));
	}
	const response = await sendKVRequest(c, namespaceId, getKVKeyUrl(keyName), {
		method: "PUT",
		headers,
		body: value,
	});
	if (!response.ok) {
		return toKVErrorResponse(response);
	}
	await response.arrayBuffer();
	return c.json(wrapResponse({}));
}

/**
 * Delete key-value pair
 *
 * @see https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/subresources/values/methods/delete/
 */
export async function deleteKVValue(
	c: AppContext,
	namespaceId: string,
	keyName: string
) {
	const response = await sendKVRequest(c, namespaceId, getKVKeyUrl(keyName), {
		method: "DELETE",
	});
	if (!response.ok) {
		return toKVErrorResponse(response);
	}
	await response.arrayBuffer();
	return c.json(wrapResponse({}));
}

type BulkGetBody = NonNullable<
	z.output<typeof zWorkersKvNamespaceGetMultipleKeyValuePairsData>["body"]
>;
/**
 * Get multiple key-value pairs
 *
 * @see https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/methods/bulk_get/
 */
export async function bulkGetKVValues(c: AppContext, body: BulkGetBody) {
	const namespace_id = c.req.param("namespace_id");
	if (!namespace_id) {
		return errorResponse(400, 10000, "Missing namespace_id parameter");
	}
	const { keys } = body;

	const response = await sendKVRequest(c, namespace_id, "http://kv/bulk/get", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ keys }),
	});
	if (!response.ok) {
		return toKVErrorResponse(response);
	}
	const values = (await response.json()) as Record<string, string | null>;
	return c.json(wrapResponse({ values }));
}
