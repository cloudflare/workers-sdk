import { createCommand, createNamespace } from "../core/create-command";
import { handlePreviewCommand, handlePreviewDeleteCommand } from "./preview";
import {
	handlePreviewSecretBulkCommand,
	handlePreviewSecretDeleteCommand,
	handlePreviewSecretListCommand,
	handlePreviewSecretPutCommand,
} from "./secret";
import {
	handlePreviewSettingsCommand,
	handlePreviewSettingsUpdateCommand,
} from "./settings";

export const previewCommand = createCommand({
	metadata: {
		description: "👀 Create a Preview deployment of the current Worker",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
	},
	positionalArgs: ["script"],
	args: {
		script: {
			describe: "The path to an entry point for your Worker",
			type: "string",
			requiresArg: true,
		},
		name: {
			describe: "Name of the Preview (defaults to current git branch)",
			type: "string",
			requiresArg: true,
		},
		tag: {
			describe: "A tag for this Preview deployment",
			type: "string",
			requiresArg: true,
		},
		message: {
			describe: "A descriptive message for this Preview deployment",
			type: "string",
			requiresArg: true,
		},
		json: {
			describe: "Return output as JSON",
			type: "boolean",
			default: false,
		},
		"ignore-defaults": {
			describe:
				"Only use settings from your config file, ignoring any Previews settings configured in the Cloudflare dashboard",
			type: "boolean",
			default: false,
		},
		"worker-name": {
			describe:
				"Name of the Worker to target (defaults to the name in your local config file)",
			type: "string",
			requiresArg: true,
		},
	},
	behaviour: {
		useConfigRedirectIfAvailable: true,
		printBanner: (args) => args.json !== true,
	},
	handler: handlePreviewCommand,
});

export const previewDeleteCommand = createCommand({
	metadata: {
		description: "Delete a Preview and all its deployments",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
	},
	args: {
		name: {
			describe:
				"Name of the Preview to delete (defaults to current git branch)",
			type: "string",
			requiresArg: true,
		},
		"skip-confirmation": {
			describe: "Skip the confirmation prompt",
			type: "boolean",
			default: false,
			alias: "y",
		},
		"worker-name": {
			describe:
				"Name of the Worker to target (defaults to the name in your local config file)",
			type: "string",
			requiresArg: true,
		},
	},
	handler: handlePreviewDeleteCommand,
});

export const previewSettingsUpdateCommand = createCommand({
	metadata: {
		description:
			"Update the Worker's Previews settings using the contents of the Wrangler config file",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
	},
	args: {
		"worker-name": {
			describe:
				"Name of the Worker to target (defaults to the name in your local config file)",
			type: "string",
			requiresArg: true,
		},
		"skip-confirmation": {
			describe: "Skip the confirmation prompt",
			type: "boolean",
			default: false,
			alias: "y",
		},
	},
	handler: handlePreviewSettingsUpdateCommand,
});

export const previewSettingsCommand = createCommand({
	metadata: {
		description: "Show the current Previews settings for a Worker",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
	},
	args: {
		"worker-name": {
			describe:
				"Name of the Worker to target (defaults to the name in your local config file)",
			type: "string",
			requiresArg: true,
		},
		json: {
			describe: "Return output as JSON",
			type: "boolean",
			default: false,
		},
	},
	behaviour: {
		printBanner: (args) => args.json !== true,
	},
	handler: handlePreviewSettingsCommand,
});

export const previewSecretNamespace = createNamespace({
	metadata: {
		description: "Manage secrets for Worker Previews",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
	},
});

export const previewSecretPutCommand = createCommand({
	metadata: {
		description: "Create or update a secret in the Worker's Previews settings",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
	},
	positionalArgs: ["key"],
	args: {
		key: {
			describe: "The secret name to be accessible in the Worker",
			type: "string",
			demandOption: true,
		},
		"worker-name": {
			describe:
				"Name of the Worker to target (defaults to the name in your local config file)",
			type: "string",
			requiresArg: true,
		},
	},
	handler: handlePreviewSecretPutCommand,
});

export const previewSecretDeleteCommand = createCommand({
	metadata: {
		description: "Delete a secret from the Worker's Previews settings",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
	},
	positionalArgs: ["key"],
	args: {
		key: {
			describe: "The secret name to delete",
			type: "string",
			demandOption: true,
		},
		"skip-confirmation": {
			describe: "Skip the confirmation prompt",
			type: "boolean",
			default: false,
			alias: "y",
		},
		"worker-name": {
			describe:
				"Name of the Worker to target (defaults to the name in your local config file)",
			type: "string",
			requiresArg: true,
		},
	},
	handler: handlePreviewSecretDeleteCommand,
});

export const previewSecretListCommand = createCommand({
	metadata: {
		description: "List all secrets in the Worker's Previews settings",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
	},
	args: {
		json: {
			describe: "Return output as JSON",
			type: "boolean",
			default: false,
		},
		"worker-name": {
			describe:
				"Name of the Worker to target (defaults to the name in your local config file)",
			type: "string",
			requiresArg: true,
		},
	},
	behaviour: {
		printBanner: (args) => args.json !== true,
	},
	handler: handlePreviewSecretListCommand,
});

export const previewSecretBulkCommand = createCommand({
	metadata: {
		description: "Upload multiple secrets to the Worker's Previews settings",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
	},
	positionalArgs: ["file"],
	args: {
		file: {
			describe: "The file of key-value pairs to upload, as JSON or .env format",
			type: "string",
		},
		"worker-name": {
			describe:
				"Name of the Worker to target (defaults to the name in your local config file)",
			type: "string",
			requiresArg: true,
		},
	},
	handler: handlePreviewSecretBulkCommand,
});
