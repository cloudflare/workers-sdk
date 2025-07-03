import { confirm, prompt } from "../dialogs";
import { logger } from "../logger";
import { isValidIdentifier } from "../type-generation";
import { formatConfigSnippet } from "./index";
import type { ResourceBinding } from "./auto-update";
import type { RawConfig } from "./config";

// Registry of resource configuration patterns for better maintainability
export const RESOURCE_CONFIG_REGISTRY = {
	d1_databases: {
		displayName: "D1 Database",
		genericBindingName: "DB",
		identifierField: "database_id" as const,
		createConfig: (resource: ResourceBinding, bindingName: string) => ({
			binding: bindingName,
			database_name: resource.name,
			database_id: resource.id,
		}),
	},
	r2_buckets: {
		displayName: "R2 Bucket",
		genericBindingName: "BUCKET",
		identifierField: "bucket_name" as const,
		createConfig: (resource: ResourceBinding, bindingName: string) => ({
			binding: bindingName,
			bucket_name: resource.name,
		}),
	},
	kv_namespaces: {
		displayName: "KV Namespace",
		genericBindingName: "KV",
		identifierField: "id" as const,
		createConfig: (resource: ResourceBinding, bindingName: string) => ({
			binding: bindingName,
			id: resource.id,
		}),
	},
	vectorize: {
		displayName: "Vectorize Index",
		genericBindingName: "VECTORIZE",
		identifierField: "index_name" as const,
		createConfig: (resource: ResourceBinding, bindingName: string) => ({
			binding: bindingName,
			index_name: resource.name,
		}),
	},
	hyperdrive: {
		displayName: "Hyperdrive Configuration",
		genericBindingName: "HYPERDRIVE",
		identifierField: "id" as const,
		createConfig: (resource: ResourceBinding, bindingName: string) => ({
			binding: bindingName,
			id: resource.id,
		}),
	},
} as const;

export function createBindingConfig(
	resource: ResourceBinding,
	bindingName: string
): Record<string, unknown> {
	const configTemplate = RESOURCE_CONFIG_REGISTRY[resource.type];
	if (!configTemplate) {
		throw new Error(`Unsupported resource type: ${resource.type}`);
	}
	return configTemplate.createConfig(resource, bindingName);
}

export function getBindingIdentifier(
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
 * Checks if a binding name conflicts with existing bindings across all resource types.
 * Binding names are case-insensitive in JavaScript.
 */
export function hasBindingNameConflict(
	config: RawConfig,
	bindingName: string
): boolean {
	const normalizedName = bindingName.toUpperCase();

	// Check all resource types for existing bindings
	for (const resourceType of Object.keys(RESOURCE_CONFIG_REGISTRY)) {
		const bindings = config[
			resourceType as keyof typeof RESOURCE_CONFIG_REGISTRY
		] as Array<Record<string, unknown>> | undefined;
		if (bindings) {
			for (const binding of bindings) {
				if (binding.binding && typeof binding.binding === "string") {
					if (binding.binding.toUpperCase() === normalizedName) {
						return true;
					}
				}
			}
		}
	}

	return false;
}

/**
 * Gets the display name for a resource type from the registry.
 */
export function getResourceDisplayName(
	resourceType: ResourceBinding["type"]
): string {
	const config = RESOURCE_CONFIG_REGISTRY[resourceType];
	return config?.displayName || resourceType.replace(/_/g, " ");
}

/**
 * Gets the generic binding name for a resource type from the registry.
 */
export function getGenericBindingName(
	resourceType: ResourceBinding["type"]
): string {
	const config = RESOURCE_CONFIG_REGISTRY[resourceType];
	return config?.genericBindingName || resourceType.toUpperCase();
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
		bindingName || resource.binding || getGenericBindingName(resource.type);
	const newBinding = createBindingConfig(resource, actualBindingName);
	const snippet = { [resource.type]: [newBinding] };

	logger.log("\n" + formatConfigSnippet(snippet, configPath));
}

/**
 * Validates that a binding name is a valid JavaScript identifier and doesn't conflict with existing bindings.
 */
export function validateBindingName(
	config: RawConfig,
	bindingName: string
): { valid: boolean; error?: string } {
	// Check if it's a valid JavaScript identifier
	if (!isValidIdentifier(bindingName)) {
		return {
			valid: false,
			error: `"${bindingName}" is not a valid JavaScript identifier. Binding names must start with a letter, underscore, or $ and contain only letters, numbers, underscores, and $.`,
		};
	}

	// Check for conflicts with existing bindings
	if (hasBindingNameConflict(config, bindingName)) {
		return {
			valid: false,
			error: `Binding name "${bindingName}" already exists. Please choose a different name.`,
		};
	}

	return { valid: true };
}

/**
 * Asks if the user wants to add the resource to their wrangler config.
 */
export async function promptForConfigUpdate(
	resourceType: ResourceBinding["type"]
): Promise<boolean> {
	return await confirm(
		`Would you like to add this ${getResourceDisplayName(resourceType)} to your wrangler.jsonc?`,
		{ defaultValue: true, fallbackValue: false }
	);
}

/**
 * Prompts the user for a binding name with conflict resolution.
 * Shows a placeholder based on the resource type and handles conflicts by re-prompting.
 */
export async function promptForValidBindingName(
	config: RawConfig,
	resourceType: ResourceBinding["type"],
	conflictingName?: string
): Promise<string> {
	const placeholder = getGenericBindingName(resourceType);

	// If there's a conflicting name, ask if they want to enter a new one
	if (conflictingName) {
		const shouldTryAgain = await confirm(
			`That binding name is not available. Would you like to enter a new binding name?`,
			{ defaultValue: true, fallbackValue: false }
		);

		if (!shouldTryAgain) {
			throw new Error(
				"Binding name conflict - user chose not to provide alternative"
			);
		}
	}

	let bindingName: string = "";
	let isValid = false;
	let currentDefault: string | undefined = placeholder;

	while (!isValid) {
		const promptOptions = currentDefault 
			? { defaultValue: currentDefault }
			: {};
		
		bindingName = await prompt(`What binding name would you like to use?`, promptOptions);

		// Use currentDefault if user just pressed enter and we have a default
		if (!bindingName || bindingName.trim() === "") {
			if (currentDefault) {
				bindingName = currentDefault;
			} else {
				// If no default and user pressed enter, continue the loop
				continue;
			}
		}

		const validation = validateBindingName(config, bindingName);
		if (validation.valid) {
			isValid = true;
		} else {
			logger.error(validation.error || "Invalid binding name");
			// Don't show the failed binding name as default on next attempt
			currentDefault = undefined;
		}
	}

	return bindingName;
}
