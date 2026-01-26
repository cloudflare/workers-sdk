#!/usr/bin/env node
/**
 * Filter and transform Cloudflare OpenAPI spec for local explorer
 *
 * Usage: node scripts/filter-openapi.mjs --input <path-to-openapi.json>
 * The full openapi spec is not committed to this repository due to its size.
 * https://github.com/cloudflare/api-schemas contains the full spec.
 *
 * This script takes openapi-filter-config.jsonc and:
 * - filters for endpoints to include
 * - filters for components to ignore (unimplemented or irrelevant locally)
 * - removes 'account_id' path parameter, security schemes, and unknown x-*
 *   extension fields
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import * as jsoncParser from "jsonc-parser";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CONFIG_PATH = join(__dirname, "openapi-filter-config.jsonc");
const OUTPUT_PATH = join(
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

/**
 * Filter an OpenAPI spec according to the provided configuration
 * @param {object} originalSpec - Full OpenAPI spec
 * @param {object} config - Filter configuration
 * @returns {object} Filtered spec
 */
function filterOpenAPISpec(originalSpec, config) {
	// Deep copy the spec once upfront so we can safely mutate it
	const spec = JSON.parse(JSON.stringify(originalSpec));
	const ignores = config.ignores ?? {};

	// 1. Filter `paths` to only the endpoints we want
	const specPaths = spec.paths;
	const filteredPaths = {};

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

	// 6. Build the filtered spec
	const filteredSpec = {
		openapi: spec.openapi,
		info: LOCAL_EXPLORER_INFO,
		servers: LOCAL_EXPLORER_SERVERS,
		paths: filteredPaths,
		components: filteredComponents,
	};

	// 7. Strip all x-* extensions from the final spec (single pass)
	return stripExtensions(filteredSpec);
}

/**
 * Load and parse a JSONC configuration file
 * @param {string} configPath
 * @returns {object}
 */
function loadFilterConfig(configPath) {
	const content = readFileSync(configPath, "utf-8");
	const errors = [];
	const config = jsoncParser.parse(content, errors, {
		allowTrailingComma: true,
	});
	if (errors.length > 0) {
		const error = errors[0];
		throw new Error(
			`Failed to parse config at ${configPath}: ${jsoncParser.printParseErrorCode(error.error)} at offset ${error.offset}`
		);
	}
	return config;
}

/**
 * Filter an OpenAPI spec file and write the result
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {object} config
 */
function filterOpenAPIFile(inputPath, outputPath, config) {
	console.log(`Reading: ${inputPath}`);
	const specContent = readFileSync(inputPath, "utf-8");
	const spec = JSON.parse(specContent);

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

/**
 * Recursively remove all x-* extension fields from an object
 * @param {unknown} obj
 * @returns {unknown}
 */
function stripExtensions(obj) {
	if (obj === null || typeof obj !== "object") {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => stripExtensions(item));
	}

	const result = {};
	for (const [key, value] of Object.entries(obj)) {
		// Skip x-* extension fields
		if (key.startsWith("x-")) {
			continue;
		}
		result[key] = stripExtensions(value);
	}
	return result;
}

/**
 * Recursively find all $ref strings in an object
 * @param {unknown} obj
 * @param {Set<string>} [refs]
 * @returns {Set<string>}
 */
function findRefs(obj, refs = new Set()) {
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

/**
 * Extract the component type and name from a $ref string
 * @param {string} ref
 * @returns {{type: string, name: string} | null}
 */
function parseRef(ref) {
	const match = ref.match(/^#\/components\/(\w+)\/(.+)$/);
	if (match) {
		return { type: match[1], name: match[2] };
	}
	return null;
}

/**
 * Recursively resolve all references, including nested ones
 * @param {object} components
 * @param {Set<string>} initialRefs
 * @returns {Set<string>}
 */
function resolveAllRefs(components, initialRefs) {
	const resolved = new Set();
	const toResolve = [...initialRefs];

	while (toResolve.length > 0) {
		const ref = toResolve.pop();
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

/**
 * Filter components to only include those that are referenced
 * @param {object} components
 * @param {Set<string>} referencedRefs
 * @returns {object}
 */
function filterComponents(components, referencedRefs) {
	const filtered = {};

	for (const ref of referencedRefs) {
		const parsed = parseRef(ref);
		if (!parsed || parsed.type === "securitySchemes") {
			continue;
		}
		const component = components[parsed.type]?.[parsed.name];
		if (component) {
			filtered[parsed.type] ??= {};
			filtered[parsed.type][parsed.name] = component;
		}
	}

	return filtered;
}

/**
 * Filter out ignored parameters and account_id from an operation
 * @param {object} operation
 * @param {string} path
 * @param {string} method
 * @param {object} ignores
 */
function applyParameterIgnores(operation, path, method, ignores) {
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

/**
 * Remove properties from a schema object (mutates in place)
 * @param {object} schema
 * @param {string[]} propsToRemove
 */
function removeSchemaProperties(schema, propsToRemove) {
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

/**
 * Apply ignores to remove unimplemented request body properties
 * @param {object} operation
 * @param {string} path
 * @param {string} method
 * @param {object} ignores
 */
function applyRequestBodyIgnores(operation, path, method, ignores) {
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

/**
 * Apply ignores to remove schema properties
 * @param {object} components
 * @param {object} ignores
 */
function applySchemaIgnores(components, ignores) {
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

/**
 * Transform path by removing /accounts/{account_id}
 * @param {string} path
 * @returns {string}
 */
function removeAccountPathParam(path) {
	return path.replace("/accounts/{account_id}", "");
}

// ============================================================================
// CLI Entry Point
// ============================================================================

const { values } = parseArgs({
	options: {
		input: {
			type: "string",
			short: "i",
		},
	},
});

if (!values.input) {
	console.error("Error: --input (-i) flag is required");
	console.error(
		"Usage: node scripts/filter-openapi.mjs --input <path-to-openapi.json>"
	);
	process.exit(1);
}

console.log(`Loading config from: ${CONFIG_PATH}`);
const config = loadFilterConfig(CONFIG_PATH);

filterOpenAPIFile(values.input, OUTPUT_PATH, config);
