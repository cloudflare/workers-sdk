import z from "zod";
import { errorResponse, wrapResponse } from "../common";
import {
	zWorkersKvNamespaceGetMultipleKeyValuePairsData,
	zWorkersKvNamespaceListANamespaceSKeysData,
	zWorkersKvNamespaceListNamespacesData,
} from "../generated/zod.gen";
import type { AppContext } from "../common";
import type { Env } from "../explorer.worker";

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

type ListNamespacesQuery = NonNullable<
	z.output<typeof zWorkersKvNamespaceListNamespacesData>["query"]
>;
/**
 * List Namespaces
 * https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/methods/list/
 */
export async function listKVNamespaces(
	c: AppContext,
	query: ListNamespacesQuery
) {
	const direction = query.direction ?? "asc";
	const order = query.order ?? "id";
	const page = query.page;
	const per_page = query.per_page;

	const kvBindingMap = c.env.LOCAL_EXPLORER_BINDING_MAP.kv;
	let namespaces = Object.entries(kvBindingMap).map(([id, bindingName]) => ({
		id: id,
		// this is not technically correct, but the title doesn't exist locally
		title: bindingName.split(":").pop() || bindingName,
	}));

	namespaces.sort((a, b) => {
		const aVal = order === "id" ? a.id : a.title;
		const bVal = order === "id" ? b.id : b.title;
		const cmp = aVal.localeCompare(bVal);
		return direction === "asc" ? cmp : -cmp;
	});

	const total_count = namespaces.length;

	// Paginate
	const startIndex = (page - 1) * per_page;
	const endIndex = startIndex + per_page;
	namespaces = namespaces.slice(startIndex, endIndex);

	return c.json({
		...wrapResponse(namespaces),
		result_info: {
			count: namespaces.length,
			page,
			per_page,
			total_count,
		},
	});
}

type ListKeysQuery = NonNullable<
	z.output<typeof zWorkersKvNamespaceListANamespaceSKeysData>["query"]
>;
/**
 * List a Namespace's Keys
 * https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/subresources/keys/methods/list/
 */
export async function listKVKeys(c: AppContext, query: ListKeysQuery) {
	const namespace_id = c.req.param("namespace_id");
	const cursor = query.cursor;
	const limit = query.limit;
	const prefix = query.prefix;

	const kv = getKVBinding(c.env, namespace_id);
	if (!kv) {
		return errorResponse(404, 10000, "Namespace not found");
	}

	const listResult = await kv.list({ cursor, limit, prefix });
	const resultCursor = "cursor" in listResult ? listResult.cursor ?? "" : "";

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
 * https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/subresources/values/methods/get/
 */
export async function getKVValue(c: AppContext) {
	const namespace_id = c.req.param("namespace_id");
	const key_name = c.req.param("key_name");

	const kv = getKVBinding(c.env, namespace_id);
	if (!kv) {
		return errorResponse(404, 10000, "Namespace not found");
	}

	const value = await kv.get(key_name, { type: "arrayBuffer" });
	if (value === null) {
		return errorResponse(404, 10000, "Key not found");
	}

	// this specific API doesn't wrap the response in the envelope
	return new Response(value);
}

/**
 * Write key-value pair with optional metadata
 * https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/subresources/values/methods/update/
 */
export async function putKVValue(c: AppContext) {
	const namespace_id = c.req.param("namespace_id");
	const key_name = c.req.param("key_name");

	const kv = getKVBinding(c.env, namespace_id);
	if (!kv) {
		return errorResponse(404, 10000, "Namespace not found");
	}

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
				return errorResponse(400, 10002, "Invalid metadata JSON");
			}
		} else if (typeof formMetadata === "string") {
			try {
				metadata = JSON.parse(formMetadata);
			} catch {
				return errorResponse(400, 10002, "Invalid metadata JSON");
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
 * https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/subresources/values/methods/delete/
 */
export async function deleteKVValue(c: AppContext) {
	const namespace_id = c.req.param("namespace_id");
	const key_name = c.req.param("key_name");

	const kv = getKVBinding(c.env, namespace_id);
	if (!kv) {
		return errorResponse(404, 10000, "Namespace not found");
	}

	await kv.delete(key_name);
	return c.json(wrapResponse({}));
}

type BulkGetBody = NonNullable<
	z.output<typeof zWorkersKvNamespaceGetMultipleKeyValuePairsData>["body"]
>;
/**
 * Get multiple key-value pairs
 * https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/methods/bulk_get/
 */
export async function bulkGetKVValues(c: AppContext, body: BulkGetBody) {
	const namespace_id = c.req.param("namespace_id");
	const { keys } = body;

	const kv = getKVBinding(c.env, namespace_id);
	if (!kv) {
		return errorResponse(404, 10000, "Namespace not found");
	}

	// Fetch all keys at once - returns Map<string, string | null>
	const results = await kv.get(keys);

	// Build result object with null for missing keys
	const values: Record<string, string | null> = {};
	for (const key of keys) {
		values[key] = results?.get(key) ?? null;
	}

	return c.json(wrapResponse({ values }));
}
