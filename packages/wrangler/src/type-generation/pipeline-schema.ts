import { logger } from "../logger";
import { getStream } from "../pipelines/client";
import { getAPIToken } from "../user";
import { toPascalCase } from "./helpers";
import { escapeTypeScriptString, isValidIdentifier } from "./index";
import type { SchemaField, Stream } from "../pipelines/types";
import type { Config } from "@cloudflare/workers-utils";

/**
 * Maximum nesting depth for struct/list types to prevent stack overflow
 */
const MAX_NESTING_DEPTH = 10;

/**
 * The default generic pipeline type when schema is unavailable
 */
export const GENERIC_PIPELINE_TYPE =
	'import("cloudflare:pipelines").Pipeline<import("cloudflare:pipelines").PipelineRecord>';

/**
 * Converts a pipeline schema field type to its TypeScript equivalent
 *
 * @param field - The schema field to convert
 * @param depth - Current nesting depth (for recursion protection)
 * @returns The TypeScript type string
 */
function schemaFieldTypeToTypeScript(field: SchemaField, depth = 0): string {
	if (depth > MAX_NESTING_DEPTH) {
		logger.warn(
			`Schema nesting depth exceeded ${MAX_NESTING_DEPTH} for field '${field.name}', using unknown type`
		);
		return "unknown";
	}

	switch (field.type) {
		case "string":
			return "string";
		case "bool":
			return "boolean";
		case "int32":
		case "int64":
		case "uint32":
		case "uint64":
		case "float32":
		case "float64":
		case "decimal128":
			return "number";
		case "timestamp":
			// Timestamps can be RFC 3339 strings or numeric Unix timestamps
			return "string | number";
		case "json":
			return "Record<string, unknown>";
		case "bytes":
			// Binary data is base64-encoded when sent as JSON
			return "string";
		case "list":
			if (field.items) {
				const itemType = schemaFieldTypeToTypeScript(field.items, depth + 1);
				return `Array<${itemType}>`;
			}
			return "unknown[]";
		case "struct":
			if (
				field.fields &&
				Array.isArray(field.fields) &&
				field.fields.length > 0
			) {
				return schemaFieldsToTypeScript(field.fields, depth + 1);
			}
			return "Record<string, unknown>";
		default:
			return "unknown";
	}
}

/**
 * Converts an array of schema fields to a TypeScript object type string
 *
 * @param fields - The array of schema fields
 * @param depth - Current nesting depth (for recursion protection)
 * @returns TypeScript object type string
 */
function schemaFieldsToTypeScript(fields: SchemaField[], depth = 0): string {
	if (fields.length === 0) {
		return "Record<string, unknown>";
	}

	const properties = fields.map((field) => {
		const optional = field.required ? "" : "?";
		const fieldType = schemaFieldTypeToTypeScript(field, depth);
		// Use quotes for field names that aren't valid identifiers, with proper escaping
		const fieldName = isValidIdentifier(field.name)
			? field.name
			: `"${escapeTypeScriptString(field.name)}"`;
		return `${fieldName}${optional}: ${fieldType}`;
	});

	return `{ ${properties.join("; ")} }`;
}

/**
 * Converts a stream name to a TypeScript type name in PascalCase with "Record" suffix
 *
 * @example
 * streamNameToTypeName("analytics_stream") // "AnalyticsStreamRecord"
 * streamNameToTypeName("my-events") // "MyEventsRecord"
 */
export function streamNameToTypeName(streamName: string): string {
	const pascalCase = toPascalCase(streamName);
	return `${pascalCase}Record`;
}

/**
 * Result of generating pipeline type from schema
 */
export interface PipelineSchemaTypeResult {
	/** The type reference to use in the binding (e.g., "Pipeline<MyStreamRecord>") */
	typeReference: string;
	/** The type definition to include at the top of the file, or null if using generic type */
	typeDefinition: string | null;
	/** The name of the generated type, or null if using generic type */
	typeName: string | null;
}

/**
 * Generates a TypeScript type for a pipeline binding based on its stream schema
 *
 * @param schema - The stream schema (or null for unstructured streams)
 * @param streamName - The name of the stream (used for type naming)
 * @returns Object containing the type reference and optional type definition
 */
export function generatePipelineTypeFromSchema(
	schema: Stream["schema"],
	streamName?: string
): PipelineSchemaTypeResult {
	if (!schema || !Array.isArray(schema.fields) || schema.fields.length === 0) {
		// Unstructured stream - use generic type
		return {
			typeReference: GENERIC_PIPELINE_TYPE,
			typeDefinition: null,
			typeName: null,
		};
	}

	const recordType = schemaFieldsToTypeScript(schema.fields);
	const typeName = streamName ? streamNameToTypeName(streamName) : null;

	if (typeName) {
		// Type is inside Cloudflare namespace, so reference it with Cloudflare. prefix
		return {
			typeReference: `import("cloudflare:pipelines").Pipeline<Cloudflare.${typeName}>`,
			typeDefinition: `type ${typeName} = ${recordType};`,
			typeName,
		};
	}

	// Fallback to inline type if no stream name available
	return {
		typeReference: `import("cloudflare:pipelines").Pipeline<${recordType}>`,
		typeDefinition: null,
		typeName: null,
	};
}

/**
 * Fetches the stream data from the API
 *
 * @param config - The wrangler config
 * @param streamId - The stream/pipeline ID
 * @returns The stream data, or null if unavailable
 */
export async function fetchStream(
	config: Config,
	streamId: string
): Promise<Stream | null> {
	try {
		return await getStream(config, streamId);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.debug(
			`Failed to fetch stream '${streamId}': ${errorMessage}. Using generic type.`
		);
		return null;
	}
}

/**
 * Checks if the user has an API token configured
 */
export function hasApiToken(): boolean {
	return getAPIToken() !== undefined;
}

/**
 * Result of fetching pipeline types
 */
export interface PipelineTypeResult {
	binding: string;
	type: string;
	typeDefinition: string | null;
	typeName: string | null;
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

	if (!hasApiToken()) {
		logger.warn(
			"Not authenticated - using generic types for pipeline bindings. Run `wrangler login` to enable typed pipeline bindings."
		);
		return pipelines.map((p) => ({
			binding: p.binding,
			type: GENERIC_PIPELINE_TYPE,
			typeDefinition: null,
			typeName: null,
		}));
	}

	// Fetch all streams in parallel for better performance
	const streams = await Promise.all(
		pipelines.map((p) => fetchStream(config, p.pipeline))
	);

	const results = pipelines.map((pipeline, i) => {
		const stream = streams[i];
		if (stream) {
			const schemaResult = generatePipelineTypeFromSchema(
				stream.schema,
				stream.name
			);
			return {
				binding: pipeline.binding,
				type: schemaResult.typeReference,
				typeDefinition: schemaResult.typeDefinition,
				typeName: schemaResult.typeName,
			};
		}
		return {
			binding: pipeline.binding,
			type: GENERIC_PIPELINE_TYPE,
			typeDefinition: null,
			typeName: null,
		};
	});

	const fetchedCount = streams.filter(Boolean).length;
	if (fetchedCount > 0) {
		logger.debug(`Fetched schemas for ${fetchedCount} pipeline binding(s)`);
	}
	if (fetchedCount < pipelines.length) {
		logger.warn(
			`Could not fetch schemas for ${pipelines.length - fetchedCount} pipeline binding(s) - using generic types`
		);
	}

	return results;
}
