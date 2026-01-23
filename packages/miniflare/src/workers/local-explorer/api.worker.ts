// local explorer API Worker
// Provides a REST API for viewing and manipulating user resources

import { fromHono } from "chanfana";
import { Hono } from "hono";
import {
	BulkGetKVValues,
	DeleteKVValue,
	GetKVValue,
	ListKVKeys,
	ListKVNamespaces,
	PutKVValue,
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

const openapi = fromHono(app, {
	base: BASE_PATH,
	schema: {
		info: {
			title: "Local Explorer API",
			version: "1.0.0",
			description:
				"A local subset of Cloudflare's REST API for exploring resources during local development.",
		},
	},
});

// ============================================================================
// KV Endpoints
// ============================================================================

openapi.get("/storage/kv/namespaces", ListKVNamespaces);
openapi.get("/storage/kv/namespaces/:namespaceId/keys", ListKVKeys);
openapi.get("/storage/kv/namespaces/:namespaceId/values/:keyName", GetKVValue);
openapi.put("/storage/kv/namespaces/:namespaceId/values/:keyName", PutKVValue);
openapi.delete(
	"/storage/kv/namespaces/:namespaceId/values/:keyName",
	DeleteKVValue
);
openapi.post("/storage/kv/namespaces/:namespaceId/bulk/get", BulkGetKVValues);

export default app;
