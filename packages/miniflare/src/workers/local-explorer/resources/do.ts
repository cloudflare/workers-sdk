import { INTROSPECT_SQLITE_METHOD } from "../../../plugins/core/constants";
import { errorResponse, wrapResponse } from "../common";
import {
	zDurableObjectsNamespaceListNamespacesData,
	zDurableObjectsNamespaceListObjectsData,
	zDurableObjectsNamespaceQuerySqliteData,
} from "../generated/zod.gen";
import type { IntrospectSqliteMethod } from "../../../plugins/core/constants";
import type { AppContext } from "../common";
import type { Env } from "../explorer.worker";
import type { z } from "zod";

type ListNamespacesQuery = NonNullable<
	z.output<typeof zDurableObjectsNamespaceListNamespacesData>["query"]
>;

/**
 * List Durable Object Namespaces
 * https://developers.cloudflare.com/api/resources/durable_objects/subresources/namespaces/methods/list/
 *
 * Returns the Durable Object namespaces available locally.
 */
export async function listDONamespaces(
	c: AppContext,
	query: ListNamespacesQuery
) {
	const { page, per_page } = query;

	const doBindingMap = c.env.LOCAL_EXPLORER_BINDING_MAP.do;

	// Convert binding map to array of namespace objects
	let namespaces = Object.entries(doBindingMap).map(([id, info]) => ({
		id, // This is the unsafeUniqueKey - ${scriptName}-${className}
		name: `${info.scriptName}_${info.className}`, // This is what the API returns...
		script: info.scriptName,
		class: info.className,
		use_sqlite: info.useSQLite,
	}));

	const totalCount = namespaces.length;

	// Paginate results
	const startIndex = (page - 1) * per_page;
	namespaces = namespaces.slice(startIndex, startIndex + per_page);

	return c.json({
		...wrapResponse(namespaces),
		result_info: {
			count: namespaces.length,
			page,
			per_page,
			total_count: totalCount,
		},
	});
}

type ListObjectsQuery = NonNullable<
	z.output<typeof zDurableObjectsNamespaceListObjectsData>["query"]
>;

interface DirectoryEntry {
	name: string;
	type: "file" | "directory";
}

/**
 * List Durable Objects in a namespace
 * https://developers.cloudflare.com/api/resources/durable_objects/subresources/namespaces/methods/list_objects/
 *
 * Returns the Durable Objects in a given namespace.
 * Objects are enumerated by reading the persist directory for .sqlite files.
 */
export async function listDOObjects(
	c: AppContext,
	namespaceId: string,
	query: ListObjectsQuery
) {
	const { limit, cursor } = query;

	if (
		!c.env.LOCAL_EXPLORER_BINDING_MAP.do[namespaceId] ||
		// No loopback service means we can't list DOs
		c.env.MINIFLARE_LOOPBACK === undefined
	) {
		return errorResponse(404, 10001, `Namespace not found: ${namespaceId}`);
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
	// so filter for those and use that to extract object IDs
	let objectIds = files
		.filter((entry) => entry.type === "file" && entry.name.endsWith(".sqlite"))
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
 * Query Durable Object SQLite storage
 *
 * Executes SQL queries against a specific Durable Object's SQLite storage
 * using introspection method that is injected into user DO classes.
 *
 * The namespace ID is the uniqueKey: scriptName-className
 */
export async function queryDOSqlite(
	c: AppContext,
	namespaceId: string,
	body: QueryBody
): Promise<Response> {
	// Look up namespace in binding map
	const ns = getDOBinding(c.env, namespaceId);

	if (!ns) {
		return errorResponse(404, 10001, `Namespace not found: ${namespaceId}`);
	}

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
