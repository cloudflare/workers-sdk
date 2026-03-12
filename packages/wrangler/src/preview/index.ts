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
			describe: "Name of the Preview (defaults to current git branch).",
			type: "string",
			requiresArg: true,
		},
		"ignore-defaults": {
			describe:
				"Ignore Previews settings when creating the Preview and deployment. Only the Wrangler config values will be used.",
			type: "boolean",
			default: false,
		},
		"worker-name": {
			describe:
				"Name of the Worker to target. Defaults to the name in your Wrangler config file.",
			type: "string",
			requiresArg: true,
		},
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
				"Name of the Worker to target. Defaults to the name in your Wrangler config file.",
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
				"Name of the Worker to target. Defaults to the name in your Wrangler config file.",
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
				"Name of the Worker to target. Defaults to the name in your Wrangler config file.",
			type: "string",
			requiresArg: true,
		},
		format: {
			describe: "Output format",
			type: "string",
			choices: ["json", "pretty"] as const,
			default: "pretty",
		},
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
		description:
			"Create or update a secret for Previews settings (or a specific Preview if --name is provided)",
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
		name: {
			describe:
				"Name of a specific preview to add the secret to. If not provided, the secret is added to Previews settings.",
			type: "string",
			requiresArg: true,
		},
		"worker-name": {
			describe:
				"Name of the Worker to target. Defaults to the name in your Wrangler config file.",
			type: "string",
			requiresArg: true,
		},
	},
	handler: handlePreviewSecretPutCommand,
});

export const previewSecretDeleteCommand = createCommand({
	metadata: {
		description:
			"Delete a secret from Previews settings (or a specific Preview if --name is provided)",
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
		name: {
			describe:
				"Name of a specific preview to delete the secret from. If not provided, the secret is deleted from Previews settings.",
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
				"Name of the Worker to target. Defaults to the name in your Wrangler config file.",
			type: "string",
			requiresArg: true,
		},
	},
	handler: handlePreviewSecretDeleteCommand,
});

export const previewSecretListCommand = createCommand({
	metadata: {
		description:
			"List all secrets from Previews settings (or a specific Preview if --name is provided)",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
	},
	args: {
		name: {
			describe:
				"Name of a specific preview to list secrets from. If not provided, lists secrets from Previews settings.",
			type: "string",
			requiresArg: true,
		},
		format: {
			describe: "Output format",
			type: "string",
			choices: ["json", "pretty"] as const,
			default: "pretty",
		},
		"worker-name": {
			describe:
				"Name of the Worker to target. Defaults to the name in your Wrangler config file.",
			type: "string",
			requiresArg: true,
		},
	},
	behaviour: {
		printBanner: (args) => args.format === "pretty",
	},
	handler: handlePreviewSecretListCommand,
});

export const previewSecretBulkCommand = createCommand({
	metadata: {
		description:
			"Upload multiple secrets to Previews settings (or a specific Preview if --name is provided)",
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
		name: {
			describe:
				"Name of a specific preview to add secrets to. If not provided, secrets are added to Previews settings.",
			type: "string",
			requiresArg: true,
		},
		"worker-name": {
			describe:
				"Name of the Worker to target. Defaults to the name in your Wrangler config file.",
			type: "string",
			requiresArg: true,
		},
	},
	handler: handlePreviewSecretBulkCommand,
});
