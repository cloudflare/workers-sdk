import type { FilterConfig } from "./filter-openapi";

/**
 * Configuration for filtering Cloudflare's OpenAPI spec for local explorer.
 * This defines which endpoints to include and what features to ignore.
 */
const config = {
	endpoints: [
		// KV Storage endpoints
		{
			path: "/accounts/{account_id}/storage/kv/namespaces",
			methods: ["get"],
		},
		{
			path: "/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/keys",
			methods: ["get"],
		},
		{
			path: "/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/values/{key_name}",
			methods: ["get", "put", "delete"],
		},
		{
			path: "/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/bulk/get",
			methods: ["post"],
		},

		// D1 Storage endpoints
		{
			path: "/accounts/{account_id}/d1/database",
			methods: ["get"],
		},
		{
			path: "/accounts/{account_id}/d1/database/{database_id}",
			methods: ["get"],
		},
		{
			path: "/accounts/{account_id}/d1/database/{database_id}/raw",
			methods: ["post"],
		},
	],

	// Ignored features (not implemented in local explorer)
	ignores: {
		// Query/path parameters not implemented
		parameters: [
			// List keys - prefix filtering not implemented
			{
				path: "/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/keys",
				method: "get",
				name: "prefix",
			},
			// Put value - expiration options not implemented
			{
				path: "/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/values/{key_name}",
				method: "put",
				name: "expiration",
			},
			{
				path: "/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/values/{key_name}",
				method: "put",
				name: "expiration_ttl",
			},
		],

		// Request body properties not implemented
		requestBodyProperties: [
			// Bulk get - type and withMetadata options not implemented
			{
				path: "/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/bulk/get",
				method: "post",
				properties: ["type", "withMetadata"],
			},
		],

		// Schema properties not returned by local implementation
		schemaProperties: {
			// Namespace response doesn't include supports_url_encoding locally
			"workers-kv_namespace": ["supports_url_encoding"],
		},
	},
} satisfies FilterConfig;

export default config;
