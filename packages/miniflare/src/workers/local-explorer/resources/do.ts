import { INTROSPECT_SQLITE_METHOD } from "../../../plugins/core/constants";
import {
	aggregateListResults,
	fetchFromPeer,
	getPeerUrlsIfAggregating,
} from "../aggregation";
import { errorResponse, wrapResponse } from "../common";
import type { IntrospectSqliteMethod } from "../../../plugins/core/constants";
import type { AppContext } from "../common";
import type { Env } from "../explorer.worker";
import type { WorkersNamespace } from "../generated";
import type {
	zDurableObjectsNamespaceListObjectsData,
	zDurableObjectsNamespaceQuerySqliteData,
} from "../generated/zod.gen";
import type { z } from "zod";

// ============================================================================
// Error Codes (matching Cloudflare API)
// ============================================================================

/** Error code for Durable Object namespace not found */
const DO_ERROR_NAMESPACE_NOT_FOUND = 10066;

// ============================================================================
// Helper Functions
// ============================================================================

interface DirectoryEntry {
	name: string;
	type: "file" | "directory";
}

interface IntrospectableDurableObject extends Rpc.DurableObjectBranded {
	[INTROSPECT_SQLITE_METHOD]: IntrospectSqliteMethod;
}

function getDOBinding(
	env: Env,
	namespaceId: string
): {
	binding: DurableObjectNamespace<IntrospectableDurableObject>;
	useSQLite: boolean;
} | null {
	const info = env.LOCAL_EXPLORER_BINDING_MAP.do[namespaceId];
	if (!info) return null;
	return {
		binding: env[
			info.binding
		] as DurableObjectNamespace<IntrospectableDurableObject>,
		useSQLite: info.useSQLite,
	};
}

/**
 * DO namespace response extended with worker name for filtering in the UI.
 * We require `id`, `name`, `script`, `class`, and `use_sqlite` since we always have them locally.
 */
type DONamespaceWithWorker = Required<WorkersNamespace> & {
	workerName: string;
};

/**
 * Get local DO namespaces from the binding map.
 * Each namespace is tagged with the worker name it belongs to.
 */
function getLocalDONamespaces(env: Env): DONamespaceWithWorker[] {
	const doBindingMap = env.LOCAL_EXPLORER_BINDING_MAP.do;
	return Object.entries(doBindingMap).map(([id, info]) => ({
		id, // This is the unsafeUniqueKey - ${scriptName}-${className}
		name: `${info.scriptName}_${info.className}`, // This is what the API returns...
		script: info.scriptName,
		class: info.className,
		use_sqlite: info.useSQLite,
		workerName: info.scriptName,
	}));
}

async function findDONamespaceOwner(
	c: AppContext,
	namespaceId: string
): Promise<string | null> {
	const peerUrls = await getPeerUrlsIfAggregating(c);
	if (peerUrls.length === 0) return null;

	const responses = await Promise.all(
		peerUrls.map(async (url) => {
			const response = await fetchFromPeer(
				url,
				"/workers/durable_objects/namespaces"
			);
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

// ============================================================================
// API Handlers
// ============================================================================

/**
 * List Durable Object Namespaces across all connected instances.
 *
 * This is an aggregated endpoint - it fetches namespaces from the local instance
 * and all peer instances in the dev registry, then merges the results.
 *
 * @see https://developers.cloudflare.com/api/resources/durable_objects/subresources/namespaces/methods/list/
 */
export async function listDONamespaces(c: AppContext) {
	const localNamespaces = getLocalDONamespaces(c.env);
	// note that we don't have duplication issues here like
	// we do for listD1Namespaces etc. because DOs are tied
	// to scripts and external DOs have already been filtered out
	const allNamespaces = await aggregateListResults(
		c,
		localNamespaces,
		"/workers/durable_objects/namespaces"
	);

	return c.json({
		...wrapResponse(allNamespaces),
		result_info: {
			count: allNamespaces.length,
		},
	});
}

type ListObjectsQuery = NonNullable<
	z.output<typeof zDurableObjectsNamespaceListObjectsData>["query"]
>;

/**
 * List Durable Objects in a namespace
 *
 * This endpoint keeps pagination as-is since it operates on a single namespace.
 * If the namespace is not found locally, it proxies to peer instances.
 *
 * @see https://developers.cloudflare.com/api/resources/durable_objects/subresources/namespaces/methods/list_objects/
 */
export async function listDOObjects(
	c: AppContext,
	namespaceId: string,
	query: ListObjectsQuery
) {
	const { limit, cursor } = query;

	// Check if namespace exists locally
	const namespaceExists = c.env.LOCAL_EXPLORER_BINDING_MAP.do[namespaceId];

	if (namespaceExists) {
		return executeListDOObjects(c, namespaceId, { limit, cursor });
	}

	const ownerMiniflare = await findDONamespaceOwner(c, namespaceId);
	if (ownerMiniflare) {
		const params = new URLSearchParams();
		if (cursor) params.set("cursor", cursor);
		if (limit !== undefined) params.set("limit", String(limit));
		const queryString = params.toString();
		const path = `/workers/durable_objects/namespaces/${encodeURIComponent(
			namespaceId
		)}/objects${queryString ? `?${queryString}` : ""}`;

		const response = await fetchFromPeer(ownerMiniflare, path);
		if (response) return response;
	}

	return errorResponse(
		404,
		DO_ERROR_NAMESPACE_NOT_FOUND,
		`Durable Object namespace ID '${namespaceId}' not found.`
	);
}

/**
 * Execute list DO objects on a local namespace.
 */
async function executeListDOObjects(
	c: AppContext,
	namespaceId: string,
	options: { limit: number; cursor?: string }
): Promise<Response> {
	const { limit, cursor } = options;

	// No loopback service means we can't list DOs
	if (c.env.MINIFLARE_LOOPBACK === undefined) {
		return errorResponse(500, 10001, "Loopback service not available");
	}

	// The DO storage structure is: <persistPath>/<uniqueKey>/<objectId>.sqlite
	// namespaceId is the uniqueKey (e.g., "my-worker-TestDO")
	// Call the loopback service to list the directory using Node.js fs
	// This bypasses workerd's disk service which has issues on Windows
	const encodedNamespaceId = encodeURIComponent(namespaceId);
	const loopbackUrl = `http://localhost/core/do-storage/${encodedNamespaceId}`;

	const response = await c.env.MINIFLARE_LOOPBACK.fetch(loopbackUrl);

	if (!response.ok) {
		// Directory doesn't exist means the DO doesn't exist
		if (response.status === 404) {
			return c.json({
				...wrapResponse([]),
				result_info: {
					count: 0,
					cursor: "",
				},
			});
		}
		return errorResponse(
			500,
			10001,
			`Failed to read DO storage: ${response.statusText}`
		);
	}

	const files = (await response.json()) as DirectoryEntry[];

	// Each DO object gets a sqlite file named <objectId>.sqlite,
	// so filter for those and use that to extract object IDs.
	// Exclude metadata.sqlite which is used by workerd for per-namespace
	// metadata (e.g. alarm storage) and is not a DO object.
	let objectIds = files
		.filter(
			(entry) =>
				entry.type === "file" &&
				entry.name.endsWith(".sqlite") &&
				entry.name !== "metadata.sqlite"
		)
		.map((entry) => entry.name.replace(/\.sqlite$/, ""));

	// Sort for consistent ordering (required for cursor pagination)
	objectIds.sort();

	if (cursor) {
		const cursorIndex = objectIds.findIndex((id) => id > cursor);
		if (cursorIndex === -1) {
			// Cursor is past all results
			objectIds = [];
		} else {
			objectIds = objectIds.slice(cursorIndex);
		}
	}

	// Apply limit
	const hasMore = objectIds.length > limit;
	const paginatedIds = objectIds.slice(0, limit);

	const objects = paginatedIds.map((id) => ({
		id,
		// TODO: check if this is correct or if we need to check the content of the sqlite file to determine if it has stored data
		hasStoredData: true,
	}));

	// Build next cursor (last ID if there are more results)
	const nextCursor = hasMore ? paginatedIds[paginatedIds.length - 1] : "";

	return c.json({
		...wrapResponse(objects),
		result_info: {
			count: objects.length,
			cursor: nextCursor,
		},
	});
}

// ============================================================================
// Query Durable Object SQLite
// ============================================================================

type QueryBody = z.output<
	typeof zDurableObjectsNamespaceQuerySqliteData
>["body"];

/**
 * Query Durable Object SQLite storage
 *
 * Executes SQL queries against a specific Durable Object's SQLite storage
 * using introspection method that is injected into user DO classes.
 *
 * If the namespace is not found locally, it proxies to peer instances.
 *
 * The namespace ID is the uniqueKey: scriptName-className
 */
export async function queryDOSqlite(
	c: AppContext,
	namespaceId: string,
	body: QueryBody
): Promise<Response> {
	// Try local first
	const ns = getDOBinding(c.env, namespaceId);

	if (ns) {
		return executeQueryDOSqlite(c, ns, namespaceId, body);
	}

	const ownerMiniflare = await findDONamespaceOwner(c, namespaceId);
	if (ownerMiniflare) {
		const response = await fetchFromPeer(
			ownerMiniflare,
			`/workers/durable_objects/namespaces/${encodeURIComponent(
				namespaceId
			)}/query`,
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
		DO_ERROR_NAMESPACE_NOT_FOUND,
		`Durable Object namespace ID '${namespaceId}' not found.`
	);
}

/**
 * Execute query on a local DO namespace.
 */
async function executeQueryDOSqlite(
	c: AppContext,
	ns: {
		binding: DurableObjectNamespace<IntrospectableDurableObject>;
		useSQLite: boolean;
	},
	namespaceId: string,
	body: QueryBody
): Promise<Response> {
	if (!ns.useSQLite) {
		return errorResponse(
			400,
			10001,
			`Namespace does not use SQLite storage: ${namespaceId}`
		);
	}

	const binding = ns.binding;
	// Get DO ID - either from hex string or from name
	let doId: DurableObjectId;
	try {
		if ("durable_object_id" in body) {
			doId = binding.idFromString(body.durable_object_id);
		} else {
			doId = binding.idFromName(body.durable_object_name);
		}
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Invalid Durable Object ID";
		return errorResponse(400, 10001, message);
	}

	if (body.queries.length === 0) {
		return errorResponse(400, 10001, "No queries provided");
	}

	const stub = binding.get(doId);

	try {
		const results = await stub[INTROSPECT_SQLITE_METHOD](body.queries);
		return c.json(wrapResponse(results));
	} catch (error) {
		const message = error instanceof Error ? error.message : "Query failed";
		return errorResponse(400, 10001, message);
	}
}
