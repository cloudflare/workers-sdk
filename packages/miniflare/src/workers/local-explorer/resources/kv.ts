import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import {
	CloudflareEnvelope,
	CursorResultInfoSchema,
	errorResponse,
	PageResultInfoSchema,
	wrapResponse,
} from "../common";
import type { AppBindings, Env } from "../api.worker";
import type { Context } from "hono";

type AppContext = Context<AppBindings>;

// ============================================================================
// KV Schemas
// ============================================================================

const KVNamespaceSchema = z.object({
	id: z.string(),
	title: z.string(),
});

const KVKeySchema = z.object({
	name: z.string(),
	expiration: z.number().optional(),
	metadata: z.unknown().optional(),
});

// ============================================================================
// KV Helpers
// ============================================================================

// Get a KV binding by namespace ID
function getKVBinding(env: Env, namespaceId: string): KVNamespace | null {
	const bindingMap = env.LOCAL_EXPLORER_BINDING_MAP.kv;

	// Find the binding name for this namespace ID
	const bindingName = bindingMap[namespaceId];
	if (!bindingName) return null;

	return env[bindingName] as KVNamespace;
}

// ============================================================================
// KV Endpoints
// ============================================================================

// https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/methods/list/
export class ListKVNamespaces extends OpenAPIRoute {
	schema = {
		tags: ["KV Storage"],
		summary: "List Namespaces",
		description: "Returns the KV namespaces available in this worker",
		request: {
			query: z.object({
				direction: z
					.enum(["asc", "desc"])
					.default("asc")
					.describe("Direction to order namespaces"),
				order: z
					.enum(["id", "title"])
					.default("id")
					.describe("Field to order results by"),
				page: z
					.number()
					.min(1)
					.default(1)
					.describe("Page number of paginated results"),
				per_page: z
					.number()
					.min(1)
					.max(1000)
					.default(20)
					.describe("Maximum number of results per page"),
			}),
		},
		responses: {
			"200": {
				description: "List of KV namespaces",
				content: {
					"application/json": {
						schema: CloudflareEnvelope(z.array(KVNamespaceSchema)).extend({
							result_info: PageResultInfoSchema,
						}),
					},
				},
			},
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { direction, order, page, per_page } = data.query;

		const kvBindingMap = c.env.LOCAL_EXPLORER_BINDING_MAP.kv;
		let namespaces = Object.entries(kvBindingMap).map(([id, bindingName]) => ({
			id: id,
			// this is not technically correct, but the title doesn't exist locally
			title: bindingName.split(":").pop() || bindingName,
		}));

		namespaces.sort(
			(a: { id: string; title: string }, b: { id: string; title: string }) => {
				const aVal = a[order];
				const bVal = b[order];
				const cmp = aVal.localeCompare(bVal);
				return direction === "asc" ? cmp : -cmp;
			}
		);

		const total_count = namespaces.length;

		// Paginate
		const startIndex = (page - 1) * per_page;
		const endIndex = startIndex + per_page;
		namespaces = namespaces.slice(startIndex, endIndex);

		return {
			...wrapResponse(namespaces),
			result_info: {
				count: namespaces.length,
				page,
				per_page,
				total_count,
			},
		};
	}
}

// https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/subresources/keys/methods/list/
export class ListKVKeys extends OpenAPIRoute {
	schema = {
		tags: ["KV Storage"],
		summary: "List a Namespace's Keys",
		description: "Lists a namespace's keys",
		request: {
			params: z.object({
				namespaceId: z.string().describe("Namespace identifier"),
			}),
			query: z.object({
				cursor: z.string().optional().describe("Pagination cursor"),
				limit: z
					.number()
					.min(10)
					.max(1000)
					.default(1000)
					.describe("Number of keys to return"),
			}),
		},
		responses: {
			"200": {
				description: "List of keys",
				content: {
					"application/json": {
						schema: CloudflareEnvelope(z.array(KVKeySchema)).extend({
							result_info: CursorResultInfoSchema.optional(),
						}),
					},
				},
			},
			"404": {
				description: "Namespace not found",
			},
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { namespaceId } = data.params;
		const { cursor, limit } = data.query;

		const kv = getKVBinding(c.env, namespaceId);
		if (!kv) {
			return errorResponse(404, 10000, "Namespace not found");
		}

		const listResult = await kv.list({ cursor, limit });
		const resultCursor = "cursor" in listResult ? listResult.cursor ?? "" : "";

		return {
			...wrapResponse(
				listResult.keys.map((key) => ({
					name: key.name,
					expiration: key.expiration,
					metadata: key.metadata,
				}))
			),
			result_info: {
				count: listResult.keys.length,
				cursor: resultCursor,
			},
		};
	}
}

// https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/subresources/values/methods/get/
export class GetKVValue extends OpenAPIRoute {
	schema = {
		tags: ["KV Storage"],
		summary: "Read key-value pair",
		description:
			"Returns the value associated with the given key. Use URL-encoding for special characters in key names.",
		request: {
			params: z.object({
				namespaceId: z.string().describe("Namespace identifier (binding name)"),
				keyName: z.string().describe("Key name (URL-encoded)"),
			}),
		},
		responses: {
			"200": {
				description: "The value associated with the key",
			},
			"404": {
				description: "Namespace or key not found",
			},
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { namespaceId, keyName } = data.params;

		const kv = getKVBinding(c.env, namespaceId);
		if (!kv) {
			return errorResponse(404, 10000, "Namespace not found");
		}

		const value = await kv.get(keyName, { type: "arrayBuffer" });
		if (value === null) {
			return errorResponse(404, 10000, "Key not found");
		}

		// this specific API doesn't wrap the response in the envelope
		return new Response(value);
	}
}

// https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/subresources/values/methods/update/
export class PutKVValue extends OpenAPIRoute {
	schema = {
		tags: ["KV Storage"],
		summary: "Write key-value pair with optional metadata",
		description:
			"Write a value identified by a key. Supports multipart/form-data for metadata.",
		request: {
			params: z.object({
				namespaceId: z.string().describe("Namespace identifier (binding name)"),
				keyName: z.string().describe("Key name (URL-encoded, max 512 bytes)"),
			}),
		},
		responses: {
			"200": {
				description: "Success",
				content: {
					"application/json": {
						schema: CloudflareEnvelope(z.object({})),
					},
				},
			},
			"404": {
				description: "Namespace not found",
			},
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { namespaceId, keyName } = data.params;

		const kv = getKVBinding(c.env, namespaceId);
		if (!kv) {
			return errorResponse(404, 10000, "Namespace not found");
		}

		let value: ArrayBuffer | string;
		let metadata: unknown | undefined;

		const contentType = c.req.header("content-type") || "";

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
				// Unknown type, try to convert to string
				value = String(formValue);
			}

			if (formMetadata instanceof Blob) {
				const metadataText = await formMetadata.text();
				try {
					metadata = JSON.parse(metadataText);
				} catch {
					return errorResponse(400, 10002, "Invalid metadata JSON");
				}
			} else if (typeof formMetadata === "string") {
				try {
					metadata = JSON.parse(formMetadata);
				} catch {
					return errorResponse(400, 10002, "Invalid metadata JSON");
				}
			}
		} else {
			value = await c.req.arrayBuffer();
		}

		const options: KVNamespacePutOptions = {};
		if (metadata) options.metadata = metadata;

		await kv.put(keyName, value, options);

		return wrapResponse({});
	}
}

// https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/subresources/values/methods/delete/
export class DeleteKVValue extends OpenAPIRoute {
	schema = {
		tags: ["KV Storage"],
		summary: "Delete key-value pair",
		description:
			"Remove a KV pair from the namespace. Use URL-encoding for special characters in key names.",
		request: {
			params: z.object({
				namespaceId: z.string().describe("Namespace identifier (binding name)"),
				keyName: z.string().describe("Key name (URL-encoded)"),
			}),
		},
		responses: {
			"200": {
				description: "Success",
				content: {
					"application/json": {
						schema: CloudflareEnvelope(z.object({})),
					},
				},
			},
			"404": {
				description: "Namespace not found",
			},
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { namespaceId, keyName } = data.params;

		const kv = getKVBinding(c.env, namespaceId);
		if (!kv) {
			return errorResponse(404, 10000, "Namespace not found");
		}

		await kv.delete(keyName);

		return wrapResponse({});
	}
}

// https://developers.cloudflare.com/api/resources/kv/subresources/namespaces/methods/bulk_get/
export class BulkGetKVValues extends OpenAPIRoute {
	schema = {
		tags: ["KV Storage"],
		summary: "Get multiple key-value pairs",
		description: "Retrieve up to 100 KV pairs from the namespace.",
		request: {
			params: z.object({
				namespaceId: z.string().describe("Namespace identifier"),
			}),
			body: {
				content: {
					"application/json": {
						schema: z.object({
							keys: z
								.array(z.string())
								.max(100)
								.describe("Array of key names to retrieve"),
						}),
					},
				},
			},
		},
		responses: {
			"200": {
				description: "Key-value pairs",
				content: {
					"application/json": {
						schema: CloudflareEnvelope(
							z.object({
								values: z.record(z.string(), z.string()),
							})
						),
					},
				},
			},
			"404": {
				description: "Namespace not found",
			},
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { namespaceId } = data.params;
		const { keys } = data.body;

		const kv = getKVBinding(c.env, namespaceId);
		if (!kv) {
			return errorResponse(404, 10000, "Namespace not found");
		}

		// Fetch all keys at once - returns Map<string, string | null>
		const results = await kv.get(keys);

		// Convert Map to object, filtering out null values
		//TODO: figure out what api actually does with nulls in a bulk get
		const values: Record<string, string> = {};
		for (const [key, value] of results) {
			if (value !== null) {
				values[key] = value;
			}
		}

		return wrapResponse({ values });
	}
}
