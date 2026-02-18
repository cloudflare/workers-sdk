// Local Explorer Worker
// Serves the explorer UI and provides a REST API for viewing and manipulating user resources

import { Hono } from "hono/tiny";
import mime from "mime";
import {
	LOCAL_EXPLORER_API_PATH,
	LOCAL_EXPLORER_BASE_PATH,
} from "../../plugins/core/constants";
import { CoreBindings } from "../core";
import { errorResponse, validateQuery, validateRequestBody } from "./common";
import {
	zCloudflareD1ListDatabasesData,
	zCloudflareD1RawDatabaseQueryData,
	zDurableObjectsNamespaceListNamespacesData,
	zDurableObjectsNamespaceListObjectsData,
	zWorkersKvNamespaceGetMultipleKeyValuePairsData,
	zWorkersKvNamespaceListANamespaceSKeysData,
	zWorkersKvNamespaceListNamespacesData,
} from "./generated/zod.gen";
import { listD1Databases, rawD1Database } from "./resources/d1";
import { listDONamespaces, listDOObjects } from "./resources/do";
import {
	bulkGetKVValues,
	deleteKVValue,
	getKVValue,
	listKVKeys,
	listKVNamespaces,
	putKVValue,
} from "./resources/kv";
import type { BindingIdMap } from "../../plugins/core/types";

export type Env = {
	[key: string]: unknown;
	[CoreBindings.JSON_LOCAL_EXPLORER_BINDING_MAP]: BindingIdMap;
	[CoreBindings.EXPLORER_DISK]: Fetcher;
	// Loopback service for calling Node.js endpoints (used for DO storage listing)
	[CoreBindings.SERVICE_LOOPBACK]?: Fetcher;
};

export type AppBindings = { Bindings: Env };

const app = new Hono<AppBindings>().basePath(LOCAL_EXPLORER_BASE_PATH);

// Global error handler - catches all uncaught errors and wraps them in an error response
app.onError((err) => {
	return errorResponse(500, 10000, err.message);
});

// ============================================================================
// Static Asset Serving
// ============================================================================

/**
 * Get the MIME type for a file path, with charset for text types
 */
function getContentType(filePath: string): string {
	let contentType = mime.getType(filePath);
	if (contentType?.startsWith("text/") && !contentType.includes("charset")) {
		contentType = `${contentType}; charset=utf-8`;
	}
	return contentType || "application/octet-stream";
}

app.get("/*", async (c, next) => {
	if (c.req.path.startsWith(LOCAL_EXPLORER_API_PATH)) {
		// continue on to API routes
		return next();
	}

	// Some simple asset path handling...
	let assetPath =
		c.req.path.replace(LOCAL_EXPLORER_BASE_PATH, "") || "/index.html";
	if (assetPath === "/") {
		assetPath = "/index.html";
	}

	// Try to fetch the requested asset
	const response = await c.env.MINIFLARE_EXPLORER_DISK.fetch(
		new URL(assetPath, "http://placeholder")
	);

	if (response.ok) {
		const contentType = getContentType(assetPath);
		return new Response(response.body, {
			headers: { "Content-Type": contentType },
		});
	}

	// SPA fallback - serve index.html for unmatched routes
	const indexResponse = await c.env.MINIFLARE_EXPLORER_DISK.fetch(
		new URL("index.html", "http://placeholder")
	);

	if (indexResponse.ok) {
		return new Response(indexResponse.body, {
			headers: { "Content-Type": "text/html; charset=utf-8" },
		});
	}

	return c.notFound();
});

// ============================================================================
// KV Endpoints
// ============================================================================

app.get(
	"/api/storage/kv/namespaces",
	// The query params are optional, so the whole schema is wrapped in an optional,
	// but hono's validator will always receive an object.
	// This just unwraps it so we can validate the inner schema.
	// The inner schema has all the individual params as optional
	validateQuery(zWorkersKvNamespaceListNamespacesData.shape.query.unwrap()),
	(c) => listKVNamespaces(c, c.req.valid("query"))
);

app.get(
	"/api/storage/kv/namespaces/:namespace_id/keys",
	validateQuery(
		zWorkersKvNamespaceListANamespaceSKeysData.shape.query.unwrap()
	),
	(c) => listKVKeys(c, c.req.valid("query"))
);

app.get(
	"/api/storage/kv/namespaces/:namespace_id/values/:key_name",
	getKVValue
);
app.put(
	"/api/storage/kv/namespaces/:namespace_id/values/:key_name",
	putKVValue
);
app.delete(
	"/api/storage/kv/namespaces/:namespace_id/values/:key_name",
	deleteKVValue
);

app.post(
	"/api/storage/kv/namespaces/:namespace_id/bulk/get",
	validateRequestBody(
		zWorkersKvNamespaceGetMultipleKeyValuePairsData.shape.body
	),
	(c) => bulkGetKVValues(c, c.req.valid("json"))
);

// ============================================================================
// D1 Endpoints
// ============================================================================

app.get(
	"/api/d1/database",
	validateQuery(zCloudflareD1ListDatabasesData.shape.query.unwrap()),
	(c) => listD1Databases(c, c.req.valid("query"))
);

app.post(
	"/api/d1/database/:database_id/raw",
	validateRequestBody(zCloudflareD1RawDatabaseQueryData.shape.body),
	(c) => rawD1Database(c, c.req.valid("json"))
);

// ============================================================================
// Durable Objects Endpoints
// ============================================================================

app.get(
	"/api/workers/durable_objects/namespaces",
	validateQuery(
		zDurableObjectsNamespaceListNamespacesData.shape.query.unwrap()
	),
	(c) => listDONamespaces(c, c.req.valid("query"))
);

app.get(
	"/api/workers/durable_objects/namespaces/:namespace_id/objects",
	validateQuery(zDurableObjectsNamespaceListObjectsData.shape.query.unwrap()),
	(c) => listDOObjects(c, c.req.param("namespace_id"), c.req.valid("query"))
);

export default app;
