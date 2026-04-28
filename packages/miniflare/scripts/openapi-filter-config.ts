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

		// R2 Storage endpoints
		// Object operations are local-only extensions (not in public API)
		{
			path: "/accounts/{account_id}/r2/buckets",
			methods: ["get"],
		},
		{
			path: "/accounts/{account_id}/r2/buckets/{bucket_name}",
			methods: ["get"],
		},
	],

	// Ignored features (not implemented in local explorer)
	ignores: {
		// Query/path parameters not implemented
		parameters: [
			// List KV namespaces - pagination not implemented (aggregated endpoint returns all)
			{
				path: "/accounts/{account_id}/storage/kv/namespaces",
				method: "get",
				name: "page",
			},
			{
				path: "/accounts/{account_id}/storage/kv/namespaces",
				method: "get",
				name: "per_page",
			},
			// List D1 databases - pagination not implemented (aggregated endpoint returns all)
			{
				path: "/accounts/{account_id}/d1/database",
				method: "get",
				name: "page",
			},
			{
				path: "/accounts/{account_id}/d1/database",
				method: "get",
				name: "per_page",
			},
			// List DO namespaces - pagination not implemented (aggregated endpoint returns all)
			{
				path: "/accounts/{account_id}/workers/durable_objects/namespaces",
				method: "get",
				name: "page",
			},
			{
				path: "/accounts/{account_id}/workers/durable_objects/namespaces",
				method: "get",
				name: "per_page",
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
			// List R2 buckets - remove all query params, just return all buckets
			{
				path: "/accounts/{account_id}/r2/buckets",
				method: "get",
				name: "name_contains",
			},
			{
				path: "/accounts/{account_id}/r2/buckets",
				method: "get",
				name: "start_after",
			},
			{
				path: "/accounts/{account_id}/r2/buckets",
				method: "get",
				name: "per_page",
			},
			{
				path: "/accounts/{account_id}/r2/buckets",
				method: "get",
				name: "order",
			},
			{
				path: "/accounts/{account_id}/r2/buckets",
				method: "get",
				name: "direction",
			},
			{
				path: "/accounts/{account_id}/r2/buckets",
				method: "get",
				name: "cursor",
			},
			// List R2 buckets - remove jurisdiction header (doesn't exist locally)
			{
				path: "/accounts/{account_id}/r2/buckets",
				method: "get",
				name: "cf-r2-jurisdiction",
			},
			// Get R2 bucket - remove jurisdiction header (doesn't exist locally)
			{
				path: "/accounts/{account_id}/r2/buckets/{bucket_name}",
				method: "get",
				name: "cf-r2-jurisdiction",
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
			// Aggregated list endpoints don't use pagination, so total_count is redundant
			// (it always equals count since we return all results)
			// minor hack: we don't remove the type for DO's (WorkersApiResponseCollection) since it
			// is used by object and namespace listing, and we do need pagination for object listing
			// but thankfully the pagination fields are optional so we just pretend they are not there
			"workers-kv_api-response-collection": ["total_count", "page", "per_page"],
			"workers-kv_result_info": ["total_count", "page", "per_page"],
			// R2 bucket - jurisdiction and location don't exist locally
			r2_bucket: ["jurisdiction", "location", "storage_class"],
			// R2 result_info - pagination not used (we return all buckets)
			r2_result_info: ["cursor", "per_page"],
		},

		// Properties to remove from inline response schemas (not in named schemas)
		responseProperties: [
			// D1 list databases has inline result_info with pagination fields
			{
				path: "/accounts/{account_id}/d1/database",
				method: "get",
				propertyPath: "result_info.total_count",
			},
			{
				path: "/accounts/{account_id}/d1/database",
				method: "get",
				propertyPath: "result_info.page",
			},
			{
				path: "/accounts/{account_id}/d1/database",
				method: "get",
				propertyPath: "result_info.per_page",
			},
		],
	},

	// Local-only extensions (not in upstream Cloudflare API)
	extensions: {
		addSchemaProperties: {
			workers_object: {
				name: {
					type: "string",
					description:
						"Name of the Durable Object instance, if created via idFromName().",
					readOnly: true,
				},
			},
		},
		paths: {
			// R2 object operations (not in public API, uses S3 API in production)
			// Response shapes match stratus dashboard API
			"/r2/buckets/{bucket_name}/objects": {
				get: {
					description:
						"List objects in an R2 bucket with optional prefix and delimiter.",
					operationId: "r2-bucket-list-objects",
					parameters: [
						{
							in: "path",
							name: "bucket_name",
							required: true,
							schema: { type: "string" },
						},
						{
							in: "query",
							name: "prefix",
							schema: { type: "string" },
							description: "Filter objects by key prefix",
						},
						{
							in: "query",
							name: "delimiter",
							schema: { type: "string" },
							description:
								"Delimiter for directory-style listing (usually '/')",
						},
						{
							in: "query",
							name: "cursor",
							schema: { type: "string" },
							description: "Pagination cursor from previous response",
						},
						{
							in: "query",
							name: "per_page",
							schema: { type: "integer", default: 1000 },
							description: "Maximum number of objects to return",
						},
					],
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
													// result is a direct array of R2Object, not nested
													result: {
														type: "array",
														items: {
															$ref: "#/components/schemas/r2_object",
														},
													},
													// delimited prefixes and cursor are in result_info
													result_info: {
														$ref: "#/components/schemas/r2_list-objects-result-info",
													},
												},
												type: "object",
											},
										],
									},
								},
							},
							description: "List objects response.",
						},
						"4XX": {
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/workers_api-response-common-failure",
									},
								},
							},
							description: "List objects failure.",
						},
					},
					summary: "List Objects in R2 Bucket",
					tags: ["R2 Bucket"],
				},
				delete: {
					description: "Delete multiple objects from an R2 bucket.",
					operationId: "r2-bucket-delete-objects",
					parameters: [
						{
							in: "path",
							name: "bucket_name",
							required: true,
							schema: { type: "string" },
						},
					],
					requestBody: {
						content: {
							"application/json": {
								schema: {
									type: "array",
									items: { type: "string" },
									description: "Array of object keys to delete",
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
														type: "array",
														items: {
															type: "object",
															properties: {
																key: { type: "string" },
															},
														},
													},
												},
												type: "object",
											},
										],
									},
								},
							},
							description: "Delete objects response.",
						},
						"4XX": {
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/workers_api-response-common-failure",
									},
								},
							},
							description: "Delete objects failure.",
						},
					},
					summary: "Delete Multiple Objects from R2 Bucket",
					tags: ["R2 Bucket"],
				},
			},
			"/r2/buckets/{bucket_name}/objects/{object_key}": {
				get: {
					description:
						"Get an object from an R2 bucket. Use cf-metadata-only header for HEAD-like behavior.",
					operationId: "r2-bucket-get-object",
					parameters: [
						{
							in: "path",
							name: "bucket_name",
							required: true,
							schema: { type: "string" },
						},
						{
							in: "path",
							name: "object_key",
							required: true,
							schema: { type: "string" },
						},
						{
							in: "header",
							name: "cf-metadata-only",
							schema: { type: "string" },
							description:
								"Set to 'true' to return only metadata (HEAD-like behavior)",
						},
					],
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
														$ref: "#/components/schemas/r2_head-object-result",
													},
												},
												type: "object",
											},
										],
									},
								},
								"application/octet-stream": {
									schema: { type: "string", format: "binary" },
								},
							},
							description: "Object content or metadata.",
						},
						"4XX": {
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/workers_api-response-common-failure",
									},
								},
							},
							description: "Get object failure.",
						},
					},
					summary: "Get Object from R2 Bucket",
					tags: ["R2 Bucket"],
				},
				put: {
					description: "Upload an object to an R2 bucket.",
					operationId: "r2-bucket-put-object",
					parameters: [
						{
							in: "path",
							name: "bucket_name",
							required: true,
							schema: { type: "string" },
						},
						{
							in: "path",
							name: "object_key",
							required: true,
							schema: { type: "string" },
						},
						{
							in: "header",
							name: "content-type",
							schema: { type: "string" },
							description: "Content type of the object",
						},
						{
							in: "header",
							name: "cf-r2-custom-metadata",
							schema: { type: "string" },
							description: "JSON-encoded custom metadata",
						},
					],
					requestBody: {
						content: {
							"application/octet-stream": {
								schema: { type: "string", format: "binary" },
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
														$ref: "#/components/schemas/r2_put-object-result",
													},
												},
												type: "object",
											},
										],
									},
								},
							},
							description: "Put object response.",
						},
						"4XX": {
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/workers_api-response-common-failure",
									},
								},
							},
							description: "Put object failure.",
						},
					},
					summary: "Upload Object to R2 Bucket",
					tags: ["R2 Bucket"],
				},
			},
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
			"/local/workers": {
				get: {
					description: "List all workers in the local dev registry.",
					operationId: "local-explorer-list-workers",
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
															$ref: "#/components/schemas/local-explorer_worker",
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
							description: "List workers response.",
						},
						"4XX": {
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/workers_api-response-common-failure",
									},
								},
							},
							description: "List workers failure.",
						},
					},
					summary: "List Workers in Dev Registry",
					tags: ["Local Explorer"],
				},
			},

			// Workflows endpoints (local-only, not pulling from upstream API)
			"/workflows": {
				get: {
					description:
						"Returns the workflows configured for local development.",
					operationId: "workflows-list-workflows",
					parameters: [],
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
															$ref: "#/components/schemas/workflows_workflow",
														},
														type: "array",
													},
													result_info: {
														properties: {
															count: {
																type: "number",
															},
														},
														type: "object",
													},
												},
												type: "object",
											},
										],
									},
								},
							},
							description: "List Workflows response.",
						},
						"4XX": {
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/workers_api-response-common-failure",
									},
								},
							},
							description: "List Workflows response failure.",
						},
					},
					summary: "List Workflows",
					tags: ["Workflows"],
				},
			},
			"/workflows/{workflow_name}": {
				get: {
					description:
						"Returns details of a specific workflow including instance status counts.",
					operationId: "workflows-get-workflow-details",
					parameters: [
						{
							in: "path",
							name: "workflow_name",
							required: true,
							schema: {
								$ref: "#/components/schemas/workflows_workflow-name",
							},
						},
					],
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
														$ref: "#/components/schemas/workflows_workflow-details",
													},
												},
												type: "object",
											},
										],
									},
								},
							},
							description: "Get Workflow Details response.",
						},
						"4XX": {
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/workers_api-response-common-failure",
									},
								},
							},
							description: "Get Workflow Details response failure.",
						},
					},
					summary: "Get Workflow Details",
					tags: ["Workflows"],
				},
				delete: {
					description:
						"Deletes all instances of a workflow by removing their persistence files.",
					operationId: "workflows-delete-workflow",
					parameters: [
						{
							in: "path",
							name: "workflow_name",
							required: true,
							schema: {
								$ref: "#/components/schemas/workflows_workflow-name",
							},
						},
					],
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
														type: "object",
														properties: {
															status: {
																type: "string",
															},
															success: {
																type: "boolean",
															},
														},
													},
												},
												type: "object",
											},
										],
									},
								},
							},
							description: "Delete Workflow response.",
						},
						"4XX": {
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/workers_api-response-common-failure",
									},
								},
							},
							description: "Delete Workflow response failure.",
						},
					},
					summary: "Delete Workflow (all instances)",
					tags: ["Workflows"],
				},
			},
			"/workflows/{workflow_name}/instances": {
				get: {
					description: "Returns the instances of a workflow.",
					operationId: "workflows-list-instances",
					parameters: [
						{
							in: "path",
							name: "workflow_name",
							required: true,
							schema: {
								$ref: "#/components/schemas/workflows_workflow-name",
							},
						},
						{
							in: "query",
							name: "page",
							schema: {
								default: 1,
								description: "Page number (1-indexed).",
								minimum: 1,
								type: "number",
							},
						},
						{
							in: "query",
							name: "per_page",
							schema: {
								default: 25,
								description: "Number of instances per page.",
								maximum: 100,
								minimum: 1,
								type: "number",
							},
						},
						{
							in: "query",
							name: "status",
							schema: {
								type: "string",
								enum: [
									"queued",
									"running",
									"paused",
									"errored",
									"terminated",
									"complete",
									"waitingForPause",
									"waiting",
								],
								description: "Filter instances by status.",
							},
						},
					],
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
															$ref: "#/components/schemas/workflows_instance",
														},
														type: "array",
													},
													result_info: {
														properties: {
															page: {
																type: "number",
															},
															per_page: {
																type: "number",
															},
															total_count: {
																type: "number",
															},
															total_pages: {
																type: "number",
															},
														},
														type: "object",
													},
												},
												type: "object",
											},
										],
									},
								},
							},
							description: "List Workflow Instances response.",
						},
						"4XX": {
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/workers_api-response-common-failure",
									},
								},
							},
							description: "List Workflow Instances response failure.",
						},
					},
					summary: "List Workflow Instances",
					tags: ["Workflows"],
				},
				post: {
					description: "Creates a new workflow instance.",
					operationId: "workflows-create-instance",
					parameters: [
						{
							in: "path",
							name: "workflow_name",
							required: true,
							schema: {
								$ref: "#/components/schemas/workflows_workflow-name",
							},
						},
					],
					requestBody: {
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										id: {
											type: "string",
											description:
												"Optional instance ID. If not provided, a UUID is generated.",
										},
										params: {
											description:
												"Optional JSON payload to pass to the workflow.",
										},
									},
								},
							},
						},
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
														type: "object",
														properties: {
															id: {
																type: "string",
																description:
																	"The instance ID of the newly created workflow instance.",
															},
														},
														required: ["id"],
													},
												},
												type: "object",
											},
										],
									},
								},
							},
							description: "Create Workflow Instance response.",
						},
						"4XX": {
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/workers_api-response-common-failure",
									},
								},
							},
							description: "Create Workflow Instance response failure.",
						},
					},
					summary: "Create Workflow Instance",
					tags: ["Workflows"],
				},
			},
			"/workflows/{workflow_name}/instances/{instance_id}": {
				get: {
					description: "Returns the status details of a workflow instance.",
					operationId: "workflows-get-instance-details",
					parameters: [
						{
							in: "path",
							name: "workflow_name",
							required: true,
							schema: {
								$ref: "#/components/schemas/workflows_workflow-name",
							},
						},
						{
							in: "path",
							name: "instance_id",
							required: true,
							schema: {
								$ref: "#/components/schemas/workflows_instance-id",
							},
						},
					],
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
														$ref: "#/components/schemas/workflows_instance-details",
													},
												},
												type: "object",
											},
										],
									},
								},
							},
							description: "Get Workflow Instance Details response.",
						},
						"4XX": {
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/workers_api-response-common-failure",
									},
								},
							},
							description: "Get Workflow Instance Details response failure.",
						},
					},
					summary: "Get Workflow Instance Details",
					tags: ["Workflows"],
				},
				delete: {
					description:
						"Deletes a workflow instance by removing its persistence files.",
					operationId: "workflows-delete-instance",
					parameters: [
						{
							in: "path",
							name: "workflow_name",
							required: true,
							schema: {
								$ref: "#/components/schemas/workflows_workflow-name",
							},
						},
						{
							in: "path",
							name: "instance_id",
							required: true,
							schema: {
								$ref: "#/components/schemas/workflows_instance-id",
							},
						},
					],
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
														type: "object",
														properties: {
															success: {
																type: "boolean",
															},
														},
													},
												},
												type: "object",
											},
										],
									},
								},
							},
							description: "Delete Workflow Instance response.",
						},
						"4XX": {
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/workers_api-response-common-failure",
									},
								},
							},
							description: "Delete Workflow Instance response failure.",
						},
					},
					summary: "Delete Workflow Instance",
					tags: ["Workflows"],
				},
			},
			"/workflows/{workflow_name}/instances/{instance_id}/status": {
				patch: {
					description:
						"Changes the status of a workflow instance (pause, resume, restart, terminate).",
					operationId: "workflows-change-instance-status",
					parameters: [
						{
							in: "path",
							name: "workflow_name",
							required: true,
							schema: {
								$ref: "#/components/schemas/workflows_workflow-name",
							},
						},
						{
							in: "path",
							name: "instance_id",
							required: true,
							schema: {
								$ref: "#/components/schemas/workflows_instance-id",
							},
						},
					],
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["action"],
									properties: {
										action: {
											type: "string",
											enum: ["pause", "resume", "restart", "terminate"],
											description:
												"The action to perform on the workflow instance.",
										},
									},
								},
							},
						},
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
														type: "object",
														properties: {
															success: {
																type: "boolean",
															},
														},
													},
												},
												type: "object",
											},
										],
									},
								},
							},
							description: "Change Workflow Instance Status response.",
						},
						"4XX": {
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/workers_api-response-common-failure",
									},
								},
							},
							description: "Change Workflow Instance Status response failure.",
						},
					},
					summary: "Change Workflow Instance Status",
					tags: ["Workflows"],
				},
			},
			"/workflows/{workflow_name}/instances/{instance_id}/events/{event_type}":
				{
					post: {
						description: "Sends an event to a workflow instance.",
						operationId: "workflows-send-instance-event",
						parameters: [
							{
								in: "path",
								name: "workflow_name",
								required: true,
								schema: {
									$ref: "#/components/schemas/workflows_workflow-name",
								},
							},
							{
								in: "path",
								name: "instance_id",
								required: true,
								schema: {
									$ref: "#/components/schemas/workflows_instance-id",
								},
							},
							{
								in: "path",
								name: "event_type",
								required: true,
								schema: {
									type: "string",
									description: "The event type to send.",
								},
							},
						],
						requestBody: {
							content: {
								"application/json": {
									schema: {
										description: "Optional JSON payload for the event.",
									},
								},
							},
						},
						responses: {
							"200": {
								content: {
									"application/json": {
										schema: {
											$ref: "#/components/schemas/workers_api-response-common",
										},
									},
								},
								description: "Send Event response.",
							},
							"4XX": {
								content: {
									"application/json": {
										schema: {
											$ref: "#/components/schemas/workers_api-response-common-failure",
										},
									},
								},
								description: "Send Event response failure.",
							},
						},
						summary: "Send Event to Workflow Instance",
						tags: ["Workflows"],
					},
				},
		},
		schemas: {
			// R2 schemas - matches stratus dashboard API shapes
			// Note: storage_class and jurisdiction/location not supported locally
			r2_object: {
				type: "object",
				properties: {
					key: {
						type: "string",
						description: "Object key (path)",
					},
					etag: {
						type: "string",
						description: "Object ETag",
					},
					size: {
						type: "integer",
						description: "Object size in bytes",
					},
					last_modified: {
						type: "string",
						format: "date-time",
						description: "Last modified timestamp",
					},
					http_metadata: {
						type: "object",
						additionalProperties: { type: "string" },
						description: "HTTP metadata for the object",
					},
					custom_metadata: {
						type: "object",
						additionalProperties: { type: "string" },
						description: "Custom user-defined metadata",
					},
				},
			},
			"r2_list-objects-result-info": {
				type: "object",
				properties: {
					delimited: {
						type: "array",
						items: { type: "string" },
						description:
							"Common prefixes when using delimiter (virtual directories)",
					},
					cursor: {
						type: "string",
						description: "Cursor for fetching next page of results",
					},
					is_truncated: {
						type: "string",
						description: "Whether there are more results to fetch",
					},
				},
			},
			"r2_head-object-result": {
				type: "object",
				properties: {
					key: {
						type: "string",
						description: "Object key (path)",
					},
					etag: {
						type: "string",
						description: "Object ETag",
					},
					last_modified: {
						type: "string",
						description: "Last modified timestamp",
					},
					size: {
						type: "integer",
						description: "Object size in bytes",
					},
					http_metadata: {
						type: "object",
						additionalProperties: { type: "string" },
						description: "HTTP metadata for the object",
					},
					custom_metadata: {
						type: "object",
						additionalProperties: { type: "string" },
						description: "Custom user-defined metadata",
					},
				},
			},
			"r2_put-object-result": {
				type: "object",
				properties: {
					key: {
						type: "string",
						description: "Object key (path)",
					},
					etag: {
						type: "string",
						description: "Object ETag",
					},
					size: {
						type: "integer",
						description: "Object size in bytes",
					},
					version: {
						type: "string",
						description: "Object version ID",
					},
				},
			},
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
			// Local Explorer worker schema (from dev registry)
			"local-explorer_worker": {
				type: "object",
				required: ["isSelf", "name"],
				properties: {
					isSelf: {
						type: "boolean",
						description: "Whether this worker is the one hosting the explorer",
					},
					name: {
						type: "string",
						description: "Worker name from the dev registry",
					},
					port: {
						type: "integer",
						description: "Port the worker is running on",
					},
					protocol: {
						type: "string",
						description: "Protocol (http or https)",
					},
					bindings: {
						$ref: "#/components/schemas/local-explorer_worker-bindings",
						description: "Resource bindings for this worker",
					},
				},
			},
			"local-explorer_worker-bindings": {
				type: "object",
				description: "Resource bindings for a worker",
				properties: {
					kv: {
						type: "array",
						items: {
							$ref: "#/components/schemas/local-explorer_resource-binding",
						},
						description: "KV namespace bindings",
					},
					d1: {
						type: "array",
						items: {
							$ref: "#/components/schemas/local-explorer_resource-binding",
						},
						description: "D1 database bindings",
					},
					r2: {
						type: "array",
						items: {
							$ref: "#/components/schemas/local-explorer_resource-binding",
						},
						description: "R2 bucket bindings",
					},
					do: {
						type: "array",
						items: {
							$ref: "#/components/schemas/local-explorer_do-binding",
						},
						description: "Durable Object bindings",
					},
					workflows: {
						type: "array",
						items: {
							$ref: "#/components/schemas/local-explorer_workflow-binding",
						},
						description: "Workflow bindings",
					},
				},
			},
			"local-explorer_resource-binding": {
				type: "object",
				required: ["id", "bindingName"],
				properties: {
					id: {
						type: "string",
						description: "Unique identifier for the resource",
					},
					bindingName: {
						type: "string",
						description: "Name of the binding in the worker's env",
					},
				},
			},
			"local-explorer_do-binding": {
				type: "object",
				required: ["id", "bindingName", "className", "scriptName", "useSqlite"],
				properties: {
					id: {
						type: "string",
						description: "Unique identifier (scriptName-className)",
					},
					bindingName: {
						type: "string",
						description: "Name of the binding in the worker's env",
					},
					className: {
						type: "string",
						description: "Durable Object class name",
					},
					scriptName: {
						type: "string",
						description: "Script containing the Durable Object",
					},
					useSqlite: {
						type: "boolean",
						description: "Whether the Durable Object uses SQLite storage",
					},
				},
			},
			"local-explorer_workflow-binding": {
				type: "object",
				required: ["id", "bindingName", "className", "scriptName"],
				properties: {
					id: {
						type: "string",
						description: "Workflow name",
					},
					bindingName: {
						type: "string",
						description: "Name of the binding in the worker's env",
					},
					className: {
						type: "string",
						description: "Workflow entrypoint class name",
					},
					scriptName: {
						type: "string",
						description: "Script containing the workflow",
					},
				},
			},

			// Workflows schemas (local-only, not pulling from upstream API)
			"workflows_workflow-name": {
				description: "The name of the workflow.",
				example: "my-workflow",
				type: "string",
			},
			"workflows_instance-id": {
				description: "The unique identifier of a workflow instance.",
				example: "my-instance-id",
				type: "string",
			},
			workflows_workflow: {
				type: "object",
				properties: {
					name: {
						type: "string",
						description: "The name of the workflow.",
					},
					class_name: {
						type: "string",
						description: "The entrypoint class name of the workflow.",
					},
					script_name: {
						type: "string",
						description: "The script name containing the workflow.",
					},
				},
				required: ["name"],
			},
			"workflows_workflow-details": {
				type: "object",
				properties: {
					name: {
						type: "string",
						description: "The name of the workflow.",
					},
					class_name: {
						type: "string",
						description: "The entrypoint class name.",
					},
					script_name: {
						type: "string",
						description: "The script containing the workflow.",
					},
					instances: {
						type: "object",
						description: "Instance counts by status.",
						properties: {
							complete: { type: "number" },
							errored: { type: "number" },
							paused: { type: "number" },
							queued: { type: "number" },
							running: { type: "number" },
							terminated: { type: "number" },
							waiting: { type: "number" },
							waitingForPause: { type: "number" },
						},
					},
				},
				required: ["name", "class_name", "script_name", "instances"],
			},
			workflows_instance: {
				type: "object",
				properties: {
					id: {
						type: "string",
						description: "The unique identifier of the workflow instance.",
					},
					status: {
						type: "string",
						enum: [
							"queued",
							"running",
							"paused",
							"errored",
							"terminated",
							"complete",
							"waitingForPause",
							"waiting",
							"unknown",
						],
						description: "The current status of the instance.",
					},
					created_on: {
						type: "string",
						description: "ISO 8601 timestamp of when the instance was created.",
					},
				},
				required: ["id"],
			},
			"workflows_instance-details": {
				type: "object",
				properties: {
					id: {
						type: "string",
						description: "The unique identifier of the workflow instance.",
					},
					status: {
						type: "string",
						enum: [
							"queued",
							"running",
							"paused",
							"errored",
							"terminated",
							"complete",
							"waitingForPause",
							"waiting",
							"unknown",
						],
						description: "The current status of the instance.",
					},
					output: {
						description: "Output value if the workflow completed successfully.",
					},
					error: {
						type: "object",
						properties: {
							name: { type: "string" },
							message: { type: "string" },
						},
						description: "Error details if the workflow errored.",
					},
				},
				required: ["id", "status"],
			},
		},
	},
} satisfies FilterConfig;

export default config;
