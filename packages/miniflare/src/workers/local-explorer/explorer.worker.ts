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
import { wrapResponse } from "./common";
import {
	zD1ListDatabasesData,
	zD1RawDatabaseQueryData,
	zDurableObjectsNamespaceListObjectsData,
	zDurableObjectsNamespaceQuerySqliteData,
	zR2BucketDeleteObjectsData,
	zR2BucketListObjectsData,
	zWorkersKvNamespaceGetMultipleKeyValuePairsData,
	zWorkersKvNamespaceListANamespaceSKeysData,
	zWorkersKvNamespaceListNamespacesData,
	zWorkflowsListInstancesData,
} from "./generated/zod.gen";
import { listD1Databases, rawD1Database } from "./resources/d1";
import { listDONamespaces, listDOObjects, queryDOSqlite } from "./resources/do";
import {
	bulkGetKVValues,
	deleteKVValue,
	getKVValue,
	listKVKeys,
	listKVNamespaces,
	putKVValue,
} from "./resources/kv";
import {
	deleteR2Objects,
	getR2Object,
	listR2Buckets,
	listR2Objects,
	putR2Object,
} from "./resources/r2";
import {
	changeWorkflowInstanceStatus,
	createWorkflowInstance,
	deleteWorkflow,
	deleteWorkflowInstance,
	getWorkflowDetails,
	getWorkflowInstanceDetails,
	listWorkflowInstances,
	listWorkflows,
	sendWorkflowInstanceEvent,
} from "./resources/workflows";
import type { BindingIdMap } from "../../plugins/core/types";
import type { WorkerRegistry } from "../../shared/dev-registry-types";
import type { LocalExplorerWorker } from "./generated";

export type Env = {
	[key: string]: unknown;
	[CoreBindings.JSON_LOCAL_EXPLORER_BINDING_MAP]: BindingIdMap;
	[CoreBindings.EXPLORER_DISK]: Fetcher;
	// Loopback service for calling Node.js endpoints:
	// - /core/dev-registry for cross-instance aggregation
	// - /core/do-storage for DO storage listing
	[CoreBindings.SERVICE_LOOPBACK]: Fetcher;
	// Worker names for this instance, used to filter self from dev registry during aggregation
	[CoreBindings.JSON_LOCAL_EXPLORER_WORKER_NAMES]: string[];
};

export type AppBindings = { Bindings: Env };

const app = new Hono<AppBindings>().basePath(LOCAL_EXPLORER_BASE_PATH);

// Global error handler - catches all uncaught errors and wraps them in an error response
app.onError((err) => {
	return errorResponse(500, 10000, err.message);
});

// ============================================================================
// Middleware
// ============================================================================

// Host/Origin checks are done in entry.worker.ts BEFORE
// header rewriting to ensure we check the actual browser-sent headers.
// This middleware only handles CORS headers for valid requests.
app.use("/api/*", async (c, next) => {
	const origin = c.req.header("Origin");

	if (c.req.method === "OPTIONS") {
		return new Response(null, {
			status: 204,
			headers: {
				"Access-Control-Allow-Origin": origin ?? "*",
				"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
				"Access-Control-Allow-Headers":
					"Content-Type, cf-metadata-only, cf-r2-custom-metadata",
				"Access-Control-Max-Age": "86400",
			},
		});
	}

	await next();

	if (origin) {
		c.res.headers.set("Access-Control-Allow-Origin", origin);
	}
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

app.get("/api/storage/kv/namespaces/:namespace_id/values/:key_name", (c) =>
	getKVValue(c, c.req.param("namespace_id"), c.req.param("key_name"))
);

app.put("/api/storage/kv/namespaces/:namespace_id/values/:key_name", (c) =>
	putKVValue(c, c.req.param("namespace_id"), c.req.param("key_name"))
);

app.delete("/api/storage/kv/namespaces/:namespace_id/values/:key_name", (c) =>
	deleteKVValue(c, c.req.param("namespace_id"), c.req.param("key_name"))
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
	validateQuery(zD1ListDatabasesData.shape.query.unwrap()),
	(c) => listD1Databases(c, c.req.valid("query"))
);

app.post(
	"/api/d1/database/:database_id/raw",
	validateRequestBody(zD1RawDatabaseQueryData.shape.body),
	(c) => rawD1Database(c, c.req.param("database_id"), c.req.valid("json"))
);

// ============================================================================
// Durable Objects Endpoints
// ============================================================================

app.get("/api/workers/durable_objects/namespaces", (c) => listDONamespaces(c));

app.get(
	"/api/workers/durable_objects/namespaces/:namespace_id/objects",
	validateQuery(zDurableObjectsNamespaceListObjectsData.shape.query.unwrap()),
	(c) => listDOObjects(c, c.req.param("namespace_id"), c.req.valid("query"))
);

app.post(
	"/api/workers/durable_objects/namespaces/:namespace_id/query",
	validateRequestBody(zDurableObjectsNamespaceQuerySqliteData.shape.body),
	(c) => queryDOSqlite(c, c.req.param("namespace_id"), c.req.valid("json"))
);

// ============================================================================
// R2 Endpoints
// ============================================================================

app.get("/api/r2/buckets", listR2Buckets);

app.get(
	"/api/r2/buckets/:bucket_name/objects",
	validateQuery(zR2BucketListObjectsData.shape.query.unwrap()),
	(c) => listR2Objects(c, c.req.param("bucket_name"), c.req.valid("query"))
);

app.get("/api/r2/buckets/:bucket_name/objects/:object_key", (c) =>
	getR2Object(c, c.req.param("bucket_name"), c.req.param("object_key"), {
		"cf-metadata-only": c.req.header("cf-metadata-only"),
	})
);

app.put("/api/r2/buckets/:bucket_name/objects/:object_key", (c) =>
	putR2Object(c, c.req.param("bucket_name"), c.req.param("object_key"), {
		"content-type": c.req.header("content-type"),
		"cf-r2-custom-metadata": c.req.header("cf-r2-custom-metadata"),
	})
);

app.delete(
	"/api/r2/buckets/:bucket_name/objects",
	validateRequestBody(zR2BucketDeleteObjectsData.shape.body),
	(c) => deleteR2Objects(c, c.req.param("bucket_name"), c.req.valid("json"))
);

// ============================================================================
// Workflows Endpoints
// ============================================================================

app.get("/api/workflows", (c) => listWorkflows(c));

app.get("/api/workflows/:workflow_name", (c) =>
	getWorkflowDetails(c, c.req.param("workflow_name"))
);

app.delete("/api/workflows/:workflow_name", (c) =>
	deleteWorkflow(c, c.req.param("workflow_name"))
);

app.get(
	"/api/workflows/:workflow_name/instances",
	validateQuery(zWorkflowsListInstancesData.shape.query.unwrap()),
	(c) =>
		listWorkflowInstances(c, c.req.param("workflow_name"), c.req.valid("query"))
);

app.post("/api/workflows/:workflow_name/instances", (c) =>
	createWorkflowInstance(c, c.req.param("workflow_name"))
);

app.get("/api/workflows/:workflow_name/instances/:instance_id", (c) =>
	getWorkflowInstanceDetails(
		c,
		c.req.param("workflow_name"),
		c.req.param("instance_id")
	)
);

app.patch("/api/workflows/:workflow_name/instances/:instance_id/status", (c) =>
	changeWorkflowInstanceStatus(
		c,
		c.req.param("workflow_name"),
		c.req.param("instance_id")
	)
);

app.post(
	"/api/workflows/:workflow_name/instances/:instance_id/events/:event_type",
	(c) =>
		sendWorkflowInstanceEvent(
			c,
			c.req.param("workflow_name"),
			c.req.param("instance_id"),
			c.req.param("event_type")
		)
);

app.delete("/api/workflows/:workflow_name/instances/:instance_id", (c) =>
	deleteWorkflowInstance(
		c,
		c.req.param("workflow_name"),
		c.req.param("instance_id")
	)
);

// ============================================================================
// Workers Registry Endpoint
// ============================================================================

app.get("/api/workers", async (c) => {
	const loopback = c.env.MINIFLARE_LOOPBACK;
	const selfWorkerNames = c.env.LOCAL_EXPLORER_WORKER_NAMES;
	const selfSet = new Set(selfWorkerNames);

	try {
		const response = await loopback.fetch("http://localhost/core/dev-registry");
		const registry = await response.json<WorkerRegistry>();

		const workers: LocalExplorerWorker[] = Object.entries(registry).map(
			([name, def]) => ({
				host: def.host,
				isSelf: selfSet.has(name),
				name,
				port: def.port,
				protocol: def.protocol,
			})
		);

		return c.json(wrapResponse(workers));
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "Failed to fetch dev registry";
		return errorResponse(500, 10000, message);
	}
});

export default app;
