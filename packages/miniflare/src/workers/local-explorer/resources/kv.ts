import z from "zod";
import {
	aggregateListResults,
	fetchFromPeer,
	getPeerUrlsIfAggregating,
} from "../aggregation";
import { errorResponse, wrapResponse } from "../common";
import {
	zWorkersKvNamespaceGetMultipleKeyValuePairsData,
	zWorkersKvNamespaceListANamespaceSKeysData,
	zWorkersKvNamespaceListNamespacesData,
} from "../generated/zod.gen";
import type { AppContext } from "../common";
import type { Env } from "../explorer.worker";
import type { WorkersKvNamespace } from "../generated";

// ============================================================================
// Error Codes (matching Cloudflare API)
// ============================================================================

/** Error code for key not found in KV namespace */
const KV_ERROR_KEY_NOT_FOUND = 10009;
/** Error code for KV namespace not found */
const KV_ERROR_NAMESPACE_NOT_FOUND = 10013;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a KV binding by namespace ID
 */
function getKVBinding(env: Env, namespace_id: string): KVNamespace | null {
	const bindingMap = env.LOCAL_EXPLORER_BINDING_MAP.kv;

	// Find the binding name for this namespace ID
	const bindingName = bindingMap[namespace_id];
	if (!bindingName) return null;

	return env[bindingName] as KVNamespace;
}

async function findKVNamespaceOwner(
	c: AppContext,
	namespaceId: string
): Promise<string | null> {
	const peerUrls = await getPeerUrlsIfAggregating(c);
	if (peerUrls.length === 0) return null;

	const responses = await Promise.all(
		peerUrls.map(async (url) => {
			const response = await fetchFromPeer(url, "/storage/kv/namespaces");
			if (!response?.ok) return null;
			const data = (await response.json()) as {
				result?: Array<{ id: string }>;
			};
			const found = data.result?.some((ns) => ns.id === namespaceId);
			return found ? url : null;
		})
	);

	return responses.find((url) => url !== null) ?? null;
}

/**
 * KV namespace response extended with worker name for filtering in the UI.
 */
type KVNamespaceWithWorker = WorkersKvNamespace & {
	workerName: string;
};

/**
 * Get local KV namespaces from the binding map.
 * Each namespace is tagged with the worker name it belongs to.
 */
function getLocalKVNamespaces(env: Env): KVNamespaceWithWorker[] {
	const kvBindingMap = env.LOCAL_EXPLORER_BINDING_MAP.kv;

	return Object.entries(kvBindingMap).map(([id, bindingName]) => {
		// Binding names follow the pattern "MINIFLARE_PROXY:kv:workerName:BINDING"
		const parts = bindingName.split(":");
		const workerName = parts.length >= 3 ? parts[2] : "unknown";
		const title = parts.pop() || bindingName;

		return {
			id,
			title,
			workerName,
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
 * List all KV namespaces across all connected instances.
 *
 * This is an aggregated endpoint - it fetches namespaces from the local instance
 * and all peer instances in the dev registry, then merges the results.
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
	const aggregatedNamespaces = await aggregateListResults(
		c,
		localNamespaces,
		"/storage/kv/namespaces"
	);

	// deduplicate by id - not totally correct, since local dev can use binding names as an 'id' :/
	// TODO: check persistence path to properly verify local uniqueness
	const localIds = new Set(localNamespaces.map((ns) => ns.id));
	const allNamespaces = aggregatedNamespaces.filter(
		(ns, index) => index < localNamespaces.length || !localIds.has(ns.id)
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
 * If the namespace is not found locally, it proxies to peer instances.
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

	// Try local first
	const kv = getKVBinding(c.env, namespace_id);
	if (kv) {
		return executeListKeys(c, kv, { cursor, limit, prefix });
	}

	const ownerMiniflare = await findKVNamespaceOwner(c, namespace_id);
	if (ownerMiniflare) {
		const params = new URLSearchParams();
		if (cursor) params.set("cursor", cursor);
		if (limit !== undefined) params.set("limit", String(limit));
		if (prefix) params.set("prefix", prefix);
		const queryString = params.toString();
		const path = `/storage/kv/namespaces/${encodeURIComponent(
			namespace_id
		)}/keys${queryString ? `?${queryString}` : ""}`;

		const response = await fetchFromPeer(ownerMiniflare, path);
		if (response) return response;
	}

	return errorResponse(
		404,
		KV_ERROR_NAMESPACE_NOT_FOUND,
		"list keys: 'namespace not found'"
	);
}

/**
 * Execute list keys on a local KV binding.
 */
async function executeListKeys(
	c: AppContext,
	kv: KVNamespace,
	options: { cursor?: string; limit?: number; prefix?: string }
) {
	const listResult = await kv.list(options);
	const resultCursor = "cursor" in listResult ? (listResult.cursor ?? "") : "";

	return c.json({
		...wrapResponse(
			listResult.keys.map((key) => ({
				name: key.name,
				expiration: key.expiration,
				metadata: key.metadata,
			}))
		),
		result_info: {
			count: listResult.keys.length,
			cursor: resultCursor,
		},
	});
}

/**
 * Read key-value pair
 *
 * If the namespace is not found locally, it proxies to peer instances.
 *
 * @see https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/subresources/values/methods/get/
 */
export async function getKVValue(
	c: AppContext,
	namespaceId: string,
	keyName: string
) {
	// Try local first
	const kv = getKVBinding(c.env, namespaceId);
	if (kv) {
		const value = await kv.get(keyName, { type: "arrayBuffer" });
		if (value === null) {
			return errorResponse(404, KV_ERROR_KEY_NOT_FOUND, "get: 'key not found'");
		}
		// this specific API doesn't wrap the response in the envelope
		return new Response(value);
	}

	const ownerMiniflare = await findKVNamespaceOwner(c, namespaceId);
	if (ownerMiniflare) {
		const response = await fetchFromPeer(
			ownerMiniflare,
			`/storage/kv/namespaces/${encodeURIComponent(
				namespaceId
			)}/values/${encodeURIComponent(keyName)}`
		);
		if (response) return response;
	}

	return errorResponse(
		404,
		KV_ERROR_NAMESPACE_NOT_FOUND,
		"get: 'namespace not found'"
	);
}

/**
 * Write key-value pair with optional metadata
 *
 * If the namespace is not found locally, it proxies to peer instances.
 *
 * @see https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/subresources/values/methods/update/
 */
export async function putKVValue(
	c: AppContext,
	namespaceId: string,
	keyName: string
) {
	// Try local first
	const kv = getKVBinding(c.env, namespaceId);
	if (kv) {
		return executePutKVValue(c, kv, keyName);
	}

	const ownerMiniflare = await findKVNamespaceOwner(c, namespaceId);
	if (ownerMiniflare) {
		const body = await c.req.arrayBuffer();
		const response = await fetchFromPeer(
			ownerMiniflare,
			`/storage/kv/namespaces/${encodeURIComponent(
				namespaceId
			)}/values/${encodeURIComponent(keyName)}`,
			{
				method: "PUT",
				headers: {
					"Content-Type":
						c.req.header("content-type") || "application/octet-stream",
				},
				body,
			}
		);
		if (response) return response;
	}

	return errorResponse(
		404,
		KV_ERROR_NAMESPACE_NOT_FOUND,
		"put: 'namespace not found'"
	);
}

/**
 * Execute put KV value on a local KV binding.
 */
async function executePutKVValue(
	c: AppContext,
	kv: KVNamespace,
	key_name: string
): Promise<Response> {
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

	const options: KVNamespacePutOptions = {};
	if (metadata) options.metadata = metadata;

	await kv.put(key_name, value, options);
	return c.json(wrapResponse({}));
}

/**
 * Delete key-value pair
 *
 * If the namespace is not found locally, it proxies to peer instances.
 *
 * @see https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/subresources/values/methods/delete/
 */
export async function deleteKVValue(
	c: AppContext,
	namespaceId: string,
	keyName: string
) {
	// Try local first
	const kv = getKVBinding(c.env, namespaceId);
	if (kv) {
		await kv.delete(keyName);
		return c.json(wrapResponse({}));
	}

	const ownerMiniflare = await findKVNamespaceOwner(c, namespaceId);
	if (ownerMiniflare) {
		const response = await fetchFromPeer(
			ownerMiniflare,
			`/storage/kv/namespaces/${encodeURIComponent(
				namespaceId
			)}/values/${encodeURIComponent(keyName)}`,
			{ method: "DELETE" }
		);
		if (response) return response;
	}

	return errorResponse(
		404,
		KV_ERROR_NAMESPACE_NOT_FOUND,
		"remove key: 'namespace not found'"
	);
}

type BulkGetBody = NonNullable<
	z.output<typeof zWorkersKvNamespaceGetMultipleKeyValuePairsData>["body"]
>;
/**
 * Get multiple key-value pairs
 *
 * If the namespace is not found locally, it proxies to peer instances.
 *
 * @see https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/methods/bulk_get/
 */
export async function bulkGetKVValues(c: AppContext, body: BulkGetBody) {
	const namespace_id = c.req.param("namespace_id");
	if (!namespace_id) {
		return errorResponse(400, 10000, "Missing namespace_id parameter");
	}
	const { keys } = body;

	// Try local first
	const kv = getKVBinding(c.env, namespace_id);
	if (kv) {
		// Fetch all keys at once - returns Map<string, string | null>
		const results = await kv.get(keys);

		// Build result object with null for missing keys
		const values: Record<string, string | null> = {};
		for (const key of keys) {
			values[key] = results?.get(key) ?? null;
		}

		return c.json(wrapResponse({ values }));
	}

	const ownerMiniflare = await findKVNamespaceOwner(c, namespace_id);
	if (ownerMiniflare) {
		const response = await fetchFromPeer(
			ownerMiniflare,
			`/storage/kv/namespaces/${encodeURIComponent(namespace_id)}/bulk/get`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			}
		);
		if (response) return response;
	}

	return errorResponse(
		404,
		KV_ERROR_NAMESPACE_NOT_FOUND,
		"bulk get keys: 'namespace not found'"
	);
}
