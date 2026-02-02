import { logger } from "../logger";
import { getStream } from "../pipelines/client";
import { getAPIToken } from "../user";
import type { SchemaField, Stream } from "../pipelines/types";
import type { Config } from "@cloudflare/workers-utils";

/**
 * The default generic pipeline type when schema is unavailable
 */
export const GENERIC_PIPELINE_TYPE =
	'import("cloudflare:pipelines").Pipeline<import("cloudflare:pipelines").PipelineRecord>';

/**
 * Converts a pipeline schema field type to its TypeScript equivalent
 */
function schemaFieldTypeToTypeScript(field: SchemaField): string {
	switch (field.type) {
		case "string":
			return "string";
		case "bool":
			return "boolean";
		case "int32":
		case "int64":
		case "float32":
		case "float64":
			return "number";
		case "timestamp":
			// Timestamps can be RFC 3339 strings or numeric Unix timestamps
			return "string | number";
		case "json":
			return "Record<string, unknown>";
		case "bytes":
			return "ArrayBuffer";
		case "list":
			if (field.items) {
				const itemType = schemaFieldTypeToTypeScript(field.items);
				return `Array<${itemType}>`;
			}
			return "unknown[]";
		case "struct":
			if (field.fields && field.fields.length > 0) {
				return schemaFieldsToTypeScript(field.fields);
			}
			return "Record<string, unknown>";
		default:
			return "unknown";
	}
}

/**
 * Converts an array of schema fields to a TypeScript object type string
 */
function schemaFieldsToTypeScript(fields: SchemaField[]): string {
	if (fields.length === 0) {
		return "Record<string, unknown>";
	}

	const properties = fields.map((field) => {
		const optional = field.required ? "" : "?";
		const fieldType = schemaFieldTypeToTypeScript(field);
		// Use quotes for field names that aren't valid identifiers
		const fieldName = isValidIdentifier(field.name)
			? field.name
			: `"${field.name}"`;
		return `${fieldName}${optional}: ${fieldType}`;
	});

	return `{ ${properties.join("; ")} }`;
}

/**
 * Check if a string is a valid TypeScript identifier
 */
function isValidIdentifier(name: string): boolean {
	return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
}

/**
 * Generates a TypeScript type string for a pipeline binding based on its stream schema
 */
export function generatePipelineTypeFromSchema(
	schema: Stream["schema"]
): string {
	if (!schema || !schema.fields || schema.fields.length === 0) {
		// Unstructured stream - use generic type
		return GENERIC_PIPELINE_TYPE;
	}

	const recordType = schemaFieldsToTypeScript(schema.fields);
	return `import("cloudflare:pipelines").Pipeline<${recordType}>`;
}

/**
 * Cache for stream schemas to avoid repeated API calls
 */
const streamSchemaCache = new Map<string, Stream["schema"] | null>();

/**
 * Fetches the schema for a stream from the API
 *
 * @param config - The wrangler config
 * @param streamId - The stream/pipeline ID
 * @returns The stream schema, or null if unavailable
 */
export async function fetchStreamSchema(
	config: Config,
	streamId: string
): Promise<Stream["schema"] | null> {
	// Check cache first
	if (streamSchemaCache.has(streamId)) {
		return streamSchemaCache.get(streamId) ?? null;
	}

	try {
		const stream = await getStream(config, streamId);
		streamSchemaCache.set(streamId, stream.schema);
		return stream.schema;
	} catch (error) {
		// Cache the failure to avoid repeated failed requests
		streamSchemaCache.set(streamId, null);
		return null;
	}
}

/**
 * Checks if the user is authenticated and can make API calls
 */
export function isAuthenticated(): boolean {
	return getAPIToken() !== undefined;
}

/**
 * Result of fetching pipeline types
 */
export interface PipelineTypeResult {
	binding: string;
	type: string;
}

/**
 * Fetches pipeline types for all pipeline bindings in the config
 *
 * If authenticated, attempts to fetch schemas from the API.
 * Falls back to generic types if not authenticated or on error.
 *
 * @param config - The wrangler config
 * @param pipelines - Array of pipeline bindings from config
 * @returns Array of pipeline type results
 */
export async function fetchPipelineTypes(
	config: Config,
	pipelines: Array<{ binding: string; pipeline: string }>
): Promise<PipelineTypeResult[]> {
	if (pipelines.length === 0) {
		return [];
	}

	if (!isAuthenticated()) {
		logger.debug(
			"Not authenticated - using generic types for pipeline bindings"
		);
		return pipelines.map((p) => ({
			binding: p.binding,
			type: GENERIC_PIPELINE_TYPE,
		}));
	}

	// Fetch all schemas in parallel for better performance
	const schemas = await Promise.all(
		pipelines.map((p) => fetchStreamSchema(config, p.pipeline))
	);

	const results = pipelines.map((pipeline, i) => ({
		binding: pipeline.binding,
		type: schemas[i]
			? generatePipelineTypeFromSchema(schemas[i])
			: GENERIC_PIPELINE_TYPE,
	}));

	const fetchedCount = schemas.filter(Boolean).length;
	if (fetchedCount > 0) {
		logger.debug(`Fetched schemas for ${fetchedCount} pipeline binding(s)`);
	}
	if (fetchedCount < pipelines.length) {
		logger.debug(
			`Could not fetch schemas for ${pipelines.length - fetchedCount} pipeline binding(s) - using generic types`
		);
	}

	return results;
}

/**
 * Clears the stream schema cache (useful for testing)
 */
export function clearStreamSchemaCache(): void {
	streamSchemaCache.clear();
}
