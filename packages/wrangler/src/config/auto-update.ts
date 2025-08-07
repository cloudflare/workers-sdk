import fs from "node:fs";
import path from "node:path";
import { applyEdits, Edit, modify } from "jsonc-parser";
import { logger } from "../logger";
import { readFileSync } from "../parse";
import {
	createBindingConfig,
	displayConfigSnippet,
	getGenericBindingName,
	getResourceDisplayName,
	promptForConfigUpdate,
	promptForValidBindingName,
	validateBindingName,
} from "./auto-update-helpers";
import { configFormat } from "./index";
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
}

/**
 * Unified function to handle binding name validation, prompting, and config updates
 * for all resource creation commands. This eliminates code duplication across
 * KV, D1, R2, Vectorize, and Hyperdrive commands.
 *
 * This function handles early binding name validation when provided,
 * prompts for binding names when needed, and manages config updates.
 */
export async function handleResourceBindingAndConfigUpdate(
	args: { configBindingName?: string; env?: string },
	config: RawConfig & { configPath?: string },
	resource: ResourceBinding
): Promise<void> {
	// If the file is not wrangler.jsonc, display the snippet
	const format = configFormat(config.configPath);
	if (format !== "jsonc") {
		logger.debug(
			`Only JSON/JSONC config files are supported for auto-update, found: ${format}. Falling back to snippet display.`
		);

		logger.log(`Add the following to your configuration file:`);
		displayConfigSnippet(resource, config.configPath);
		return;
	}

	const { type: resourceType, id: resourceId, name: resourceName } = resource;
	let shouldUpdate = true;

	// Validate binding name (passed via arguments). If invalid, notify and give them the opportunity to add the config binding name interactive.
	if (args.configBindingName) {
		const bindingNameIsValid = validateBindingName(
			config,
			args.configBindingName
		);
		if (bindingNameIsValid.valid) {
			resource.binding = args.configBindingName;
		} else {
			logger.log(`⚠️ You entered an invalid binding name.`);
		}
	}

	// If there is no binding name in args, prompt to know if user wants to create binding in wrangler.jsonc
	if (!resource.binding) {
		shouldUpdate = await promptForConfigUpdate(resourceType);

		// If the user does want to update wrangler.jsonc, get a valid binding name
		if (shouldUpdate) {
			resource.binding = await promptForValidBindingName(config, resourceType);
		}
	}

	// We now have a valid binding name. We can use it to update the wrangler.jsonc config.
	if (resource.binding) {
		updateJsonConfig(config.configPath!, resource, config);
	} else {
		// Show snippet only
		const envString = args.env ? ` under [env.${args.env}]` : "";
		logger.log(`Add the following to your configuration file:`);

		displayConfigSnippet(resource, config.configPath);
	}
}

export function updateJsonConfig(
	configPath: string,
	resource: ResourceBinding,
	config: RawConfig
) {
	// Read the original file content to preserve formatting and comments
	const originalContent = readFileSync(configPath);
	let edits: Edit[] = [];

	// Use the provided binding name (should be validated before calling this function)
	const bindingName = resource.binding || getGenericBindingName(resource.type);

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

	// Log success with display name
	const resourceTypeName = getResourceDisplayName(resource.type);
	logger.log(
		`✅ Updated ${path.relative(process.cwd(), configPath)} with new ${resourceTypeName} binding: ${bindingName} (${resource.name}, ID: ${resource.id})`
	);
}
