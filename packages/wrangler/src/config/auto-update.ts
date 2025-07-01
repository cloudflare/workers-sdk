import fs from "node:fs";
import path from "node:path";
import { applyEdits, modify } from "jsonc-parser";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { parseJSONC, readFileSync } from "../parse";
import { findWranglerConfig } from "./config-helpers";
import { configFormat, formatConfigSnippet } from "./index";
import type { RawConfig } from "./config";

export interface ResourceBinding {
	type:
		| "d1_databases"
		| "r2_buckets"
		| "kv_namespaces"
		| "vectorize"
		| "hyperdrive";
	id: string;
	name: string;
	binding?: string;
	additionalConfig?: Record<string, unknown>;
}

// Generic binding names for each resource type
const GENERIC_BINDING_NAMES: Record<string, string> = {
	d1_databases: "DB",
	kv_namespaces: "KV",
	r2_buckets: "BUCKET",
	vectorize: "VECTORIZE",
	hyperdrive: "HYPERDRIVE",
};

// Registry of resource configuration patterns for better maintainability
const RESOURCE_CONFIG_REGISTRY = {
	d1_databases: {
		identifierField: "database_id" as const,
		createConfig: (resource: ResourceBinding, bindingName: string) => ({
			binding: bindingName,
			database_name: resource.name,
			database_id: resource.id,
			...resource.additionalConfig,
		}),
	},
	r2_buckets: {
		identifierField: "bucket_name" as const,
		createConfig: (resource: ResourceBinding, bindingName: string) => ({
			binding: bindingName,
			bucket_name: resource.name,
			...resource.additionalConfig,
		}),
	},
	kv_namespaces: {
		identifierField: "id" as const,
		createConfig: (resource: ResourceBinding, bindingName: string) => ({
			binding: bindingName,
			...resource.additionalConfig, // This allows passing id or preview_id
		}),
	},
	vectorize: {
		identifierField: "index_name" as const,
		createConfig: (resource: ResourceBinding, bindingName: string) => ({
			binding: bindingName,
			index_name: resource.name,
			...resource.additionalConfig,
		}),
	},
	hyperdrive: {
		identifierField: "id" as const,
		createConfig: (resource: ResourceBinding, bindingName: string) => ({
			binding: bindingName,
			id: resource.id,
			...resource.additionalConfig,
		}),
	},
} as const;

/**
 * Automatically updates the wrangler.jsonc config file with a new resource binding.
 * Only supports JSON/JSONC files. Prompts user for confirmation unless autoUpdate is true.
 */
export async function autoUpdateWranglerConfig(
	resource: ResourceBinding,
	autoUpdate: boolean = false,
	cwd: string = process.cwd()
): Promise<boolean> {
	const { configPath } = findWranglerConfig(cwd);

	if (!configPath) {
		logger.debug("No wrangler config file found, skipping auto-update");
		return false;
	}

	const format = configFormat(configPath);
	if (format !== "jsonc") {
		logger.debug(
			`Only JSON/JSONC config files are supported for auto-update, found: ${format}`
		);
		return false;
	}

	try {
		// Check if resource already exists
		const content = readFileSync(configPath);
		const config = parseJSONC(content, configPath) as RawConfig;

		if (resourceAlreadyExists(config, resource)) {
			logger.debug(
				`Binding for ${resource.type} ${resource.id} already exists`
			);
			return false;
		}

		// Prompt user for confirmation unless auto-update is enabled
		if (!autoUpdate) {
			const shouldUpdate = await confirm(
				`Would you like to update the wrangler.jsonc file with the new ${capitalizeResourceType(resource.type)} binding?`,
				{ defaultValue: true, fallbackValue: false }
			);

			if (!shouldUpdate) {
				return false;
			}
		}

		updateJsonConfig(configPath, resource, config);
		return true;
	} catch (error) {
		logger.debug(`Failed to auto-update wrangler config: ${error}`);
		return false;
	}
}

function updateJsonConfig(
	configPath: string,
	resource: ResourceBinding,
	config: RawConfig
) {
	// Read the original file content to preserve formatting and comments
	const originalContent = readFileSync(configPath);
	let edits: any[] = [];

	// Generate a unique binding name that doesn't conflict
	const bindingName = generateUniqueBindingName(config, resource);

	// Create new binding configuration
	const newBinding = createBindingConfig(resource, bindingName);

	// Check if the resource type array exists
	if (!config[resource.type]) {
		// Create the entire array with the new binding
		edits = modify(originalContent, [resource.type], [newBinding], {
			formattingOptions: { tabSize: 2, insertSpaces: true },
		});
	} else {
		// Add to existing array (using -1 to append to end)
		edits = modify(originalContent, [resource.type, -1], newBinding, {
			formattingOptions: { tabSize: 2, insertSpaces: true },
		});
	}

	// Apply the edits to preserve formatting and comments
	const updatedContent = applyEdits(originalContent, edits);

	// Write back to file
	fs.writeFileSync(configPath, updatedContent);

	// Log success with capitalized resource type
	const resourceTypeName = capitalizeResourceType(resource.type);
	logger.log(
		`✅ Updated ${path.relative(process.cwd(), configPath)} with new ${resourceTypeName} binding: ${bindingName} (${resource.name}, ID: ${resource.id})`
	);
}

function createBindingConfig(
	resource: ResourceBinding,
	bindingName: string
): Record<string, unknown> {
	const configTemplate = RESOURCE_CONFIG_REGISTRY[resource.type];
	if (!configTemplate) {
		throw new Error(`Unsupported resource type: ${resource.type}`);
	}
	return configTemplate.createConfig(resource, bindingName);
}

function getBindingIdentifier(
	binding: Record<string, unknown>,
	type: ResourceBinding["type"]
): string | undefined {
	const configTemplate = RESOURCE_CONFIG_REGISTRY[type];
	if (!configTemplate) {
		return undefined;
	}

	const field = configTemplate.identifierField;
	return binding[field] as string;
}

/**
 * Simplified helper function for integrating auto-update into create commands.
 * Attempts auto-update and falls back to displaying config snippet if it fails.
 */
export async function updateWranglerConfigOrDisplaySnippet(
	resource: ResourceBinding,
	configPath: string | undefined,
	autoUpdate: boolean = false,
	fallbackMessage = "Add the following to your wrangler configuration file:"
): Promise<void> {
	const updated = await autoUpdateWranglerConfig(resource, autoUpdate);

	if (!updated) {
		logger.log(fallbackMessage);
		displayConfigSnippet(resource, configPath);
	}
}

/**
 * Display a configuration snippet for a resource binding.
 * This is used to show users how to manually add the binding if auto-update fails.
 */
export function displayConfigSnippet(
	resource: ResourceBinding,
	configPath: string | undefined,
	bindingName?: string
) {
	const actualBindingName =
		bindingName ||
		GENERIC_BINDING_NAMES[resource.type] ||
		resource.type.toUpperCase();
	const newBinding = createBindingConfig(resource, actualBindingName);
	const snippet = { [resource.type]: [newBinding] };

	logger.log("\n" + formatConfigSnippet(snippet, configPath));
}

/**
 * Checks if a resource binding already exists in the config.
 */
function resourceAlreadyExists(
	config: RawConfig,
	resource: ResourceBinding
): boolean {
	const bindings = config[resource.type] as
		| Array<Record<string, unknown>>
		| undefined;
	if (!bindings) {
		return false;
	}
	return bindings.some(
		(binding: any) =>
			getBindingIdentifier(binding, resource.type) === resource.id
	);
}

/**
 * Generates a unique binding name that doesn't conflict with existing bindings in the config.
 */
function generateUniqueBindingName(
	config: RawConfig,
	resource: ResourceBinding
): string {
	const baseBindingName =
		resource.binding ||
		GENERIC_BINDING_NAMES[resource.type] ||
		resource.type.toUpperCase();
	const existingBindings = getAllExistingBindingNames(config);

	let bindingName = baseBindingName;
	let counter = 1;

	// Keep trying with incrementing numbers until we find a unique name
	while (existingBindings.has(bindingName.toUpperCase())) {
		bindingName = `${baseBindingName}_${counter}`;
		counter++;
	}

	return bindingName;
}

/**
 * Collects all existing binding names from the config to check for conflicts.
 * Binding names are case-insensitive in JavaScript, so we normalize to uppercase.
 */
function getAllExistingBindingNames(config: RawConfig): Set<string> {
	const bindingNames = new Set<string>();

	// Check all resource types for existing bindings
	for (const resourceType of Object.keys(RESOURCE_CONFIG_REGISTRY)) {
		const bindings = config[
			resourceType as keyof typeof RESOURCE_CONFIG_REGISTRY
		] as Array<Record<string, unknown>> | undefined;
		if (bindings) {
			for (const binding of bindings) {
				if (binding.binding && typeof binding.binding === "string") {
					bindingNames.add(binding.binding.toUpperCase());
				}
			}
		}
	}

	return bindingNames;
}

/**
 * Capitalizes resource type names for user-facing messages.
 */
function capitalizeResourceType(resourceType: string): string {
	const typeMap: Record<string, string> = {
		d1_databases: "D1 Database",
		r2_buckets: "R2 Bucket",
		kv_namespaces: "KV Namespace",
		vectorize: "Vectorize Index",
		hyperdrive: "Hyperdrive Configuration",
	};

	return typeMap[resourceType] || resourceType.replace(/_/g, " ");
}
