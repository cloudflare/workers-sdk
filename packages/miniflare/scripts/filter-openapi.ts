#!/usr/bin/env -S node -r esbuild-register
/**
 * Filter and transform Cloudflare OpenAPI spec for local explorer
 *
 * Usage:
 * 1. Download the full OpenAPI spec from https://github.com/cloudflare/api-schemas
 * 2. Run `OPENAPI_INPUT_PATH=<path> pnpm generate:api` to filter and generate types
 *    (or run the script directly with:
 *    node -r esbuild-register scripts/filter-openapi.ts --input <path-to-schema> [--output <path>])

 * This script outputs a filtered OpenAPI spec based on the configuration in
 * openapi-filter-config.ts, which defines:
 * - filters for endpoints to include
 * - filters for components to ignore (unimplemented or irrelevant locally)
 *
 * We also strip out 'account_id' path parameter, security schemes, and unknown
 *   x-* extension fields
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import config from "./openapi-filter-config";

// ============================================================================
// CLI Entry Point
// ============================================================================
const DEFAULT_OUTPUT_PATH = join(
	__dirname,
	"../src/workers/local-explorer/openapi.local.json"
);

const LOCAL_EXPLORER_INFO = {
	title: "Local Explorer API",
	description:
		"Local subset of Cloudflare API for exploring resources during local development.",
	version: "0.0.1",
};

const LOCAL_EXPLORER_SERVERS = [
	{
		description: "Local Explorer",
		url: "/cdn-cgi/explorer/api",
	},
];

const { values } = parseArgs({
	options: {
		input: {
			type: "string",
			short: "i",
		},
		output: {
			type: "string",
			short: "o",
		},
	},
});

if (!values.input) {
	console.error("Error: --input (-i) flag is required");
	console.error(
		"Usage: node -r esbuild-register scripts/filter-openapi.ts --input <path-to-openapi.json> [--output <path>]"
	);
	process.exit(1);
}

const outputPath = values.output ?? DEFAULT_OUTPUT_PATH;
writeFilteredOpenAPIFile(values.input, outputPath, config);

// ============================================================================
// Types
// ============================================================================

export interface FilterConfig {
	endpoints: EndpointConfig[];
	ignores?: IgnoresConfig;
	extensions?: ExtensionsConfig;
}

export interface ExtensionsConfig {
	paths?: Record<string, Record<string, OpenAPIOperation>>;
	schemas?: Record<string, OpenAPISchema>;
}
export interface EndpointConfig {
	path: string;
	methods: string[];
}

export interface ParameterIgnore {
	path: string;
	method: string;
	name: string;
}

export interface RequestBodyIgnore {
	path: string;
	method: string;
	properties: string[];
}

export interface IgnoresConfig {
	parameters?: ParameterIgnore[];
	requestBodyProperties?: RequestBodyIgnore[];
	schemaProperties?: Record<string, string[]>;
}
interface OpenAPIOperation {
	parameters?: Array<{ name: string; [key: string]: unknown }>;
	requestBody?: {
		content: Record<string, { schema?: OpenAPISchema; [key: string]: unknown }>;
		[key: string]: unknown;
	};
	security?: unknown;
	[key: string]: unknown;
}

interface OpenAPISchema {
	properties?: Record<string, OpenAPIOperation>;
	required?: string[];
	[key: string]: unknown;
}

interface OpenAPIComponents {
	schemas?: Record<string, OpenAPISchema>;
	[key: string]: Record<string, unknown> | undefined;
}

interface OpenAPISpec {
	openapi: string;
	info: unknown;
	servers?: unknown[];
	paths: Record<string, Record<string, OpenAPIOperation>>;
	components: OpenAPIComponents;
}

interface ParsedRef {
	type: string;
	name: string;
}

function filterOpenAPISpec(
	originalSpec: OpenAPISpec,
	config: FilterConfig
): OpenAPISpec {
	// Deep copy the spec once upfront so we can safely mutate it
	const spec: OpenAPISpec = JSON.parse(JSON.stringify(originalSpec));
	const ignores = config.ignores ?? {};

	// 1. Filter `paths` to only the endpoints we want
	const specPaths = spec.paths;
	const filteredPaths: Record<string, Record<string, OpenAPIOperation>> = {};

	for (const { path: originalPath, methods } of config.endpoints) {
		if (!specPaths[originalPath]) {
			throw new Error(
				`Path specified in config not found in full spec: ${originalPath}`
			);
		}

		const newPath = removeAccountPathParam(originalPath);
		filteredPaths[newPath] = {};

		for (const method of methods) {
			const operation = specPaths[originalPath][method];
			if (operation) {
				// Apply parameter ignores (always removes account_id)
				applyParameterIgnores(operation, originalPath, method, ignores);

				// Apply request body ignores (if any)
				applyRequestBodyIgnores(operation, originalPath, method, ignores);

				// Remove security from operation since we implement that differently locally
				delete operation.security;

				filteredPaths[newPath][method] = operation;
			}
		}
	}

	// 2. Apply schema ignores before finding refs
	const components = spec.components;
	applySchemaIgnores(components, ignores);

	// 3. Find all $refs used in the filtered paths
	const pathRefs = findRefs(filteredPaths);

	// 4. Recursively resolve all nested references
	const allRefs = resolveAllRefs(components, pathRefs);

	// 5. Filter components to only those referenced
	const filteredComponents = filterComponents(components, allRefs);

	// 6. Apply temporary patches for upstream OpenAPI schema bugs
	applyTemporarySchemaPatches(filteredComponents);

	// 7. Build the filtered spec
	const filteredSpec: OpenAPISpec = {
		openapi: spec.openapi,
		info: LOCAL_EXPLORER_INFO,
		servers: LOCAL_EXPLORER_SERVERS,
		paths: filteredPaths,
		components: filteredComponents,
	};

	// 8. Merge extensions (local-only paths and schemas not in upstream API)
	if (config.extensions) {
		if (config.extensions.paths) {
			Object.assign(filteredSpec.paths, config.extensions.paths);
		}
		if (config.extensions.schemas) {
			filteredSpec.components.schemas ??= {};
			Object.assign(filteredSpec.components.schemas, config.extensions.schemas);
		}
	}

	// 9. Strip all x-* extensions from the final spec (single pass)
	return stripExtensions(filteredSpec) as OpenAPISpec;
}

// ============================================================================
// Temporary Patches
// ============================================================================
// These patches fix bugs in the upstream Cloudflare OpenAPI schema.
// TODO: Remove these once the upstream issues are fixed.
// Track upstream issues at: https://github.com/cloudflare/api-schemas/issues

/**
 * Apply temporary patches to fix known bugs in the upstream OpenAPI schema.
 */
function applyTemporarySchemaPatches(components: OpenAPIComponents): void {
	// PATCH: workers-kv_bulk-get-result is missing nullable on additionalProperties
	// The API returns null for non-existent keys, but the schema doesn't allow it.
	// The similar schema workers-kv_bulk-get-result-with-metadata correctly has nullable: true.
	// See: https://github.com/cloudflare/api-schemas (no issue filed yet)
	const bulkGetResult = components.schemas?.["workers-kv_bulk-get-result"] as
		| Record<string, unknown>
		| undefined;
	if (bulkGetResult) {
		const properties = bulkGetResult.properties as
			| Record<string, unknown>
			| undefined;
		const values = properties?.values as Record<string, unknown> | undefined;
		if (values?.additionalProperties) {
			const additionalProps = values.additionalProperties as Record<
				string,
				unknown
			>;
			if (!additionalProps.nullable) {
				additionalProps.nullable = true;
				console.log(
					"PATCH: Added nullable: true to workers-kv_bulk-get-result.values.additionalProperties"
				);
			}
		}
	}
}

function writeFilteredOpenAPIFile(
	inputPath: string,
	outputPath: string,
	config: FilterConfig
): void {
	console.log(`Reading: ${inputPath}`);
	const specContent = readFileSync(inputPath, "utf-8");
	const spec: OpenAPISpec = JSON.parse(specContent);

	const specPaths = spec.paths;
	const specComponents = spec.components;
	console.log(`Original paths: ${Object.keys(specPaths).length}`);
	console.log(
		`Original schemas: ${Object.keys(specComponents?.schemas ?? {}).length}`
	);

	const filteredSpec = filterOpenAPISpec(spec, config);

	const filteredPaths = filteredSpec.paths;
	const filteredComponents = filteredSpec.components;
	console.log(`Filtered paths: ${Object.keys(filteredPaths).length}`);
	console.log(
		`Filtered schemas: ${Object.keys(filteredComponents?.schemas ?? {}).length}`
	);

	// Ensure output directory exists
	mkdirSync(dirname(outputPath), { recursive: true });

	console.log(`Writing: ${outputPath}`);
	writeFileSync(outputPath, JSON.stringify(filteredSpec, null, "\t"), "utf-8");

	console.log("Done!");
}

// ============================================================================
// Transformation functions
// ============================================================================
function stripExtensions(obj: unknown): unknown {
	if (obj === null || typeof obj !== "object") {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => stripExtensions(item));
	}

	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		// Skip x-* extension fields
		if (key.startsWith("x-")) {
			continue;
		}
		result[key] = stripExtensions(value);
	}
	return result;
}

function findRefs(obj: unknown, refs: Set<string> = new Set()): Set<string> {
	if (obj === null || typeof obj !== "object") {
		return refs;
	}

	if (Array.isArray(obj)) {
		for (const item of obj) {
			findRefs(item, refs);
		}
	} else {
		for (const [key, value] of Object.entries(obj)) {
			if (key === "$ref" && typeof value === "string") {
				refs.add(value);
			} else {
				findRefs(value, refs);
			}
		}
	}

	return refs;
}

function parseRef(ref: string): ParsedRef | null {
	const match = ref.match(/^#\/components\/(\w+)\/(.+)$/);
	if (match) {
		return { type: match[1], name: match[2] };
	}
	return null;
}

function resolveAllRefs(
	components: OpenAPIComponents,
	initialRefs: Set<string>
): Set<string> {
	const resolved = new Set<string>();
	const toResolve = [...initialRefs];

	while (toResolve.length > 0) {
		const ref = toResolve.pop()!;
		if (resolved.has(ref)) {
			continue;
		}
		resolved.add(ref);

		const parsed = parseRef(ref);
		if (!parsed) {
			continue;
		}

		const component = components[parsed.type]?.[parsed.name];
		if (component) {
			const nestedRefs = findRefs(component);
			for (const nestedRef of nestedRefs) {
				if (!resolved.has(nestedRef)) {
					toResolve.push(nestedRef);
				}
			}
		}
	}

	return resolved;
}

function filterComponents(
	components: OpenAPIComponents,
	referencedRefs: Set<string>
): OpenAPIComponents {
	const filtered: OpenAPIComponents = {};

	for (const ref of referencedRefs) {
		const parsed = parseRef(ref);
		if (!parsed || parsed.type === "securitySchemes") {
			continue;
		}
		const component = components[parsed.type]?.[parsed.name];
		if (component) {
			filtered[parsed.type] ??= {};
			filtered[parsed.type]![parsed.name] = component;
		}
	}

	return filtered;
}

function applyParameterIgnores(
	operation: OpenAPIOperation,
	path: string,
	method: string,
	ignores: IgnoresConfig
): void {
	if (!operation.parameters) {
		return;
	}

	const ignoredParams = new Set(
		ignores.parameters
			?.filter((p) => p.path === path && p.method === method)
			.map((p) => p.name)
	);
	// Always filter out account_id since we don't support account scoping locally
	ignoredParams.add("account_id");

	operation.parameters = operation.parameters.filter(
		(p) => !ignoredParams.has(p.name)
	);
}

function removeSchemaProperties(
	schema: OpenAPISchema,
	propsToRemove: string[]
): void {
	if (!schema.properties) {
		return;
	}
	const props = schema.properties;
	for (const prop of propsToRemove) {
		delete props[prop];
	}
	if (schema.required) {
		schema.required = schema.required.filter((r) => !propsToRemove.includes(r));
	}
}

function applyRequestBodyIgnores(
	operation: OpenAPIOperation,
	path: string,
	method: string,
	ignores: IgnoresConfig
): void {
	if (!operation.requestBody || !ignores.requestBodyProperties) {
		return;
	}

	const ignoreConfig = ignores.requestBodyProperties.find(
		(p) => p.path === path && p.method === method
	);

	if (!ignoreConfig) {
		return;
	}

	const requestBody = operation.requestBody;
	const content = requestBody.content;
	for (const mediaType of Object.values(content)) {
		const schema = mediaType.schema;
		if (schema) {
			removeSchemaProperties(schema, ignoreConfig.properties);
		}
	}
}

function applySchemaIgnores(
	components: OpenAPIComponents,
	ignores: IgnoresConfig
): void {
	if (!components.schemas || !ignores.schemaProperties) {
		return;
	}

	for (const [schemaName, propsToRemove] of Object.entries(
		ignores.schemaProperties
	)) {
		const schema = components.schemas[schemaName];
		if (schema) {
			removeSchemaProperties(schema, propsToRemove);
		}
	}
}

function removeAccountPathParam(path: string): string {
	return path.replace("/accounts/{account_id}", "");
}
