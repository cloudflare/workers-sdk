// Local Explorer API Worker
// Provides a REST API for viewing and manipulating user resources

import { Hono } from "hono/tiny";
import { validateQuery, validateRequestBody } from "./common";
import {
	zWorkersKvNamespaceGetMultipleKeyValuePairsData,
	zWorkersKvNamespaceListANamespaceSKeysData,
	zWorkersKvNamespaceListNamespacesData,
} from "./generated/zod.gen";
import {
	bulkGetKVValues,
	deleteKVValue,
	getKVValue,
	listKVKeys,
	listKVNamespaces,
	putKVValue,
} from "./resources/kv";

type BindingIdMap = {
	kv: Record<string, string>; // namespaceId -> bindingName
};
export type Env = {
	[key: string]: unknown;
	LOCAL_EXPLORER_BINDING_MAP: BindingIdMap;
};

export type AppBindings = { Bindings: Env };

const BASE_PATH = "/cdn-cgi/explorer/api";

const app = new Hono<AppBindings>().basePath(BASE_PATH);

// ============================================================================
// KV Endpoints
// ============================================================================

app.get(
	"/storage/kv/namespaces",
	// we are unwrapping (ie removing optional) because h
	validateQuery(zWorkersKvNamespaceListNamespacesData.shape.query.unwrap()),
	(c) => listKVNamespaces(c, c.req.valid("query"))
);

app.get(
	"/storage/kv/namespaces/:namespace_id/keys",
	validateQuery(
		zWorkersKvNamespaceListANamespaceSKeysData.shape.query.unwrap()
	),
	(c) => listKVKeys(c, c.req.valid("query"))
);

app.get("/storage/kv/namespaces/:namespace_id/values/:key_name", getKVValue);
app.put("/storage/kv/namespaces/:namespace_id/values/:key_name", putKVValue);
app.delete(
	"/storage/kv/namespaces/:namespace_id/values/:key_name",
	deleteKVValue
);

app.post(
	"/storage/kv/namespaces/:namespace_id/bulk/get",
	validateRequestBody(
		zWorkersKvNamespaceGetMultipleKeyValuePairsData.shape.body
	),
	(c) => bulkGetKVValues(c, c.req.valid("json"))
);

export default app;
