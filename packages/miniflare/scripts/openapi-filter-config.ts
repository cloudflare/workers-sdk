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
			path: "/accounts/{account_id}/d1/database/{database_id}/raw",
			methods: ["post"],
		},

		// Durable Objects endpoints
		{
			path: "/accounts/{account_id}/workers/durable_objects/namespaces",
			methods: ["get"],
		},
		{
			path: "/accounts/{account_id}/workers/durable_objects/namespaces/{id}/objects",
			methods: ["get"],
		},
	],

	// Ignored features (not implemented in local explorer)
	ignores: {
		// Query/path parameters not implemented
		parameters: [
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
			// D1 database response doesn't include created_at locally
			"d1_database-response": ["created_at"],
			// D1 query meta doesn't include served_by fields locally
			"d1_query-meta": [
				"d1_served-by-colo",
				"d1_served-by-region",
				"served_by_colo",
				"served_by_primary",
				"served_by_region",
			],
		},
	},

	// Local-only extensions (not in upstream Cloudflare API)
	extensions: {
		paths: {
			"/workers/durable_objects/namespaces/{namespace_id}/query": {
				post: {
					description:
						"Execute SQL queries against a Durable Object's SQLite storage.",
					operationId: "durable-objects-namespace-query-sqlite",
					parameters: [
						{
							in: "path",
							name: "namespace_id",
							required: true,
							schema: {
								$ref: "#/components/schemas/workers_schemas-id",
							},
						},
					],
					requestBody: {
						content: {
							"application/json": {
								schema: {
									oneOf: [
										{ $ref: "#/components/schemas/do_query-by-id" },
										{ $ref: "#/components/schemas/do_query-by-name" },
									],
								},
							},
						},
						required: true,
					},
					responses: {
						"200": {
							content: {
								"application/json": {
									schema: {
										allOf: [
											{
												$ref: "#/components/schemas/workers_api-response-common",
											},
											{
												properties: {
													result: {
														items: {
															$ref: "#/components/schemas/do_raw-query-result",
														},
														type: "array",
													},
												},
												type: "object",
											},
										],
									},
								},
							},
							description: "Query response.",
						},
						"4XX": {
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/workers_api-response-common-failure",
									},
								},
							},
							description: "Query response failure.",
						},
					},
					summary: "Query Durable Object SQLite",
					tags: ["Durable Objects Namespace"],
				},
			},
		},
		schemas: {
			"do_sql-with-params": {
				type: "object",
				required: ["sql"],
				properties: {
					sql: {
						type: "string",
						minLength: 1,
						description: "SQL query to execute",
					},
					params: {
						type: "array",
						items: {},
						description: "Optional parameters for the SQL query",
					},
				},
			},
			"do_query-by-id": {
				type: "object",
				required: ["durable_object_id", "queries"],
				properties: {
					durable_object_id: {
						type: "string",
						minLength: 1,
						description: "Hex string ID of the Durable Object",
					},
					queries: {
						type: "array",
						items: { $ref: "#/components/schemas/do_sql-with-params" },
						description: "Array of SQL queries to execute",
					},
				},
			},
			"do_query-by-name": {
				type: "object",
				required: ["durable_object_name", "queries"],
				properties: {
					durable_object_name: {
						type: "string",
						minLength: 1,
						description: "Name to derive DO ID via idFromName()",
					},
					queries: {
						type: "array",
						items: { $ref: "#/components/schemas/do_sql-with-params" },
						description: "Array of SQL queries to execute",
					},
				},
			},
			"do_raw-query-result": {
				type: "object",
				properties: {
					columns: {
						type: "array",
						items: { type: "string" },
						description: "Column names from the query result",
					},
					rows: {
						type: "array",
						items: { type: "array", items: {} },
						description: "Array of row arrays containing query results",
					},
					meta: {
						type: "object",
						properties: {
							rows_read: {
								type: "number",
								description: "Number of rows read during query execution",
							},
							rows_written: {
								type: "number",
								description: "Number of rows written during query execution",
							},
						},
					},
				},
			},
		},
	},
} satisfies FilterConfig;

export default config;
