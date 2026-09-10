import { HttpError } from "miniflare:shared";
import { KVHeaders, KVParams } from "../../kv/constants";
import { validateKey, validatePutOptions } from "../../kv/validator.worker";
import { SharedHeaders } from "../../shared/constants";
import { aggregateListResults } from "../aggregation";
import { errorResponse, wrapResponse } from "../common";
import { executeKVBulkOperations, type KVBulkExecutionResult } from "./kv-bulk";
import type { AppContext } from "../common";
import type { Env } from "../explorer.worker";
import type { WorkersKvNamespace } from "../generated";
import type {
	zWorkersKvNamespaceDeleteMultipleKeyValuePairsData,
	zWorkersKvNamespaceGetMultipleKeyValuePairsData,
	zWorkersKvNamespaceListANamespaceSKeysData,
	zWorkersKvNamespaceListNamespacesData,
	zWorkersKvNamespaceWriteMultipleKeyValuePairsData,
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
	return errorResponse(
		response.status,
		code,
		await getKVErrorMessage(response)
	);
}

async function getKVErrorMessage(response: Response): Promise<string> {
	const fallback = response.statusText || "Internal KV request failed";
	try {
		return (await response.text()) || fallback;
	} catch {
		return fallback;
	}
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

type BulkWriteBody = NonNullable<
	z.output<typeof zWorkersKvNamespaceWriteMultipleKeyValuePairsData>["body"]
>;
type BulkDeleteBody = NonNullable<
	z.output<typeof zWorkersKvNamespaceDeleteMultipleKeyValuePairsData>["body"]
>;

interface PreparedKVWrite {
	key: string;
	value: string | Uint8Array;
	expiration?: number;
	expirationTtl?: number;
	metadata?: unknown;
}

const textEncoder = new TextEncoder();

function decodeBase64(value: string): Uint8Array {
	try {
		return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
	} catch {
		throw new HttpError(400, "Invalid base64 value");
	}
}

/* Safely serialise values for comparison in de-duplication */
function stableStringify(value: unknown): string | undefined {
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}
	if (value !== null && typeof value === "object") {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function valuesEqual(
	left: string | Uint8Array,
	right: string | Uint8Array
): boolean {
	const leftBytes = typeof left === "string" ? textEncoder.encode(left) : left;
	const rightBytes =
		typeof right === "string" ? textEncoder.encode(right) : right;
	return (
		leftBytes.byteLength === rightBytes.byteLength &&
		leftBytes.every((byte, index) => byte === rightBytes[index])
	);
}

function preparedKVWritesEqual(
	left: PreparedKVWrite,
	right: PreparedKVWrite
): boolean {
	return (
		valuesEqual(left.value, right.value) &&
		left.expiration === right.expiration &&
		left.expirationTtl === right.expirationTtl &&
		stableStringify(left.metadata) === stableStringify(right.metadata)
	);
}

function deduplicateKVWrites(operations: PreparedKVWrite[]): PreparedKVWrite[] {
	const uniqueOperations = new Map<string, PreparedKVWrite>();
	for (const operation of operations) {
		const existing = uniqueOperations.get(operation.key);
		if (existing === undefined) {
			uniqueOperations.set(operation.key, operation);
		} else if (!preparedKVWritesEqual(existing, operation)) {
			throw new HttpError(
				400,
				`received duplicate key with different values or expiration parameters: "${operation.key}"`
			);
		}
	}
	return [...uniqueOperations.values()];
}

function prepareKVWrites(body: BulkWriteBody): PreparedKVWrite[] {
	const now = Math.floor(Date.now() / 1000);

	const operations = body.map((item) => {
		const metadata = item.metadata;
		const rawMetadata =
			metadata === undefined ? null : JSON.stringify(metadata);
		validatePutOptions(item.key, {
			now,
			rawExpiration: item.expiration?.toString() ?? null,
			rawExpirationTtl: item.expiration_ttl?.toString() ?? null,
			rawMetadata,
		});

		const value = item.base64 ? decodeBase64(item.value) : item.value;

		return {
			key: item.key,
			value,
			expiration: item.expiration,
			expirationTtl: item.expiration_ttl,
			metadata,
		};
	});
	return deduplicateKVWrites(operations);
}

function bulkValidationError(error: unknown): Response {
	if (error instanceof HttpError) {
		return errorResponse(error.code, 10001, error.message);
	}
	throw error;
}

function bulkExecutionResponse(
	c: AppContext,
	execution: KVBulkExecutionResult
): Response {
	if (execution.result.unsuccessful_keys?.length === 0) {
		return c.json(wrapResponse(execution.result));
	}

	const status =
		execution.error instanceof HttpError ? execution.error.code : 500;
	const code = execution.error instanceof HttpError ? 10001 : 10000;
	const message =
		execution.error instanceof Error
			? execution.error.message
			: "Internal KV request failed";
	return errorResponse(status, code, message, execution.result);
}

async function putPreparedKVValue(
	c: AppContext,
	namespaceId: string,
	operation: PreparedKVWrite
): Promise<void> {
	const url = getKVKeyUrl(operation.key);
	if (operation.expirationTtl !== undefined) {
		url.searchParams.set(
			KVParams.EXPIRATION_TTL,
			operation.expirationTtl.toString()
		);
	} else if (operation.expiration !== undefined) {
		url.searchParams.set(KVParams.EXPIRATION, operation.expiration.toString());
	}

	const headers = new Headers();
	if (operation.metadata !== undefined) {
		headers.set(KVHeaders.METADATA, JSON.stringify(operation.metadata));
	}
	const response = await sendKVRequest(c, namespaceId, url, {
		method: "PUT",
		headers,
		body: operation.value,
	});
	if (!response.ok) {
		throw new HttpError(response.status, await getKVErrorMessage(response));
	}
}

async function deletePreparedKVValue(
	c: AppContext,
	namespaceId: string,
	key: string
): Promise<void> {
	const response = await sendKVRequest(c, namespaceId, getKVKeyUrl(key), {
		method: "DELETE",
	});
	if (!response.ok) {
		throw new HttpError(response.status, await getKVErrorMessage(response));
	}
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

/**
 * Write multiple key-value pairs.
 *
 * @see https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/methods/bulk_update/
 */
export async function bulkWriteKVValues(c: AppContext, body: BulkWriteBody) {
	const namespaceId = c.req.param("namespace_id");
	if (!namespaceId) {
		return errorResponse(400, 10000, "Missing namespace_id parameter");
	}
	let operations: PreparedKVWrite[];
	try {
		operations = prepareKVWrites(body);
	} catch (error) {
		return bulkValidationError(error);
	}

	const execution = await executeKVBulkOperations(operations, (operation) =>
		putPreparedKVValue(c, namespaceId, operation)
	);
	return bulkExecutionResponse(c, execution);
}

/**
 * Delete multiple key-value pairs.
 *
 * @see https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/methods/bulk_delete/
 */
export async function bulkDeleteKVValues(c: AppContext, body: BulkDeleteBody) {
	const namespaceId = c.req.param("namespace_id");
	if (!namespaceId) {
		return errorResponse(400, 10000, "Missing namespace_id parameter");
	}
	try {
		for (const key of body) {
			validateKey(key);
		}
	} catch (error) {
		return bulkValidationError(error);
	}

	const operations = [...new Set(body)].map((key) => ({ key }));
	const execution = await executeKVBulkOperations(operations, (operation) =>
		deletePreparedKVValue(c, namespaceId, operation.key)
	);
	return bulkExecutionResponse(c, execution);
}
