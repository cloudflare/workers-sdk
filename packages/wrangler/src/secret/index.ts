import {
	fetchSecrets,
	isWorkerNotFoundError,
	parseBulkInputToObject,
} from "@cloudflare/deploy-helpers";
import { APIError, configFileName, UserError } from "@cloudflare/workers-utils";
import { fetchResult } from "../cfetch";
import { createCommand, createNamespace } from "../core/create-command";
import { createWorkerUploadForm } from "../deployment-bundle/create-worker-upload-form";
import { confirm, prompt } from "../dialogs";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { getLegacyScriptName } from "../utils/getLegacyScriptName";
import { readFromStdin, trimTrailingWhitespace } from "../utils/std";
import { useServiceEnvironments } from "../utils/useServiceEnvironments";
import type { Config } from "@cloudflare/workers-utils";

export const VERSION_NOT_DEPLOYED_ERR_CODE = 10215;

type SecretBindingUpload = {
	type: "secret_text";
	name: string;
	text: string;
};

async function createDraftWorker({
	config,
	args,
	accountId,
	scriptName,
}: {
	config: Config;
	args: { env?: string; name?: string };
	accountId: string;
	scriptName: string;
}) {
	const confirmation = await confirm(
		`There doesn't seem to be a Worker called "${scriptName}". Do you want to create a new Worker with that name and add secrets to it?`,
		// we want to default to true in non-interactive/CI contexts to preserve existing behaviour
		{ defaultValue: true, fallbackValue: true }
	);
	if (!confirmation) {
		logger.log("Aborting. No secrets added.");
		return null;
	} else {
		logger.log(`🌀 Creating new Worker "${scriptName}"...`);
	}
	await fetchResult(
		config,
		useServiceEnvironments(config) && args.env
			? `/accounts/${accountId}/workers/services/${scriptName}/environments/${args.env}`
			: `/accounts/${accountId}/workers/scripts/${scriptName}`,
		{
			method: "PUT",
			body: createWorkerUploadForm(
				{
					name: scriptName,
					main: {
						name: scriptName,
						filePath: undefined,
						content: `export default { fetch() {} }`,
						type: "esm",
					},
					modules: [],
					migrations: undefined,
					compatibility_date: undefined,
					compatibility_flags: undefined,
					keepVars: false, // this doesn't matter since it's a new script anyway
					keepSecrets: false, // this doesn't matter since it's a new script anyway
					logpush: false,
					sourceMaps: undefined,
					placement: undefined,
					tail_consumers: undefined,
					limits: undefined,
					assets: undefined,
					containers: undefined,
					observability: undefined,
					cache: undefined,
				},
				{}
			),
		}
	);
}
export const secretNamespace = createNamespace({
	metadata: {
		description: "🤫 Generate a secret that can be referenced in a Worker",
		status: "stable",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
	},
});
export const secretPutCommand = createCommand({
	metadata: {
		description: "Create or update a secret for a Worker",
		status: "stable",
		owner: "Workers: Deploy and Config",
	},
	positionalArgs: ["key"],
	behaviour: {
		supportTemporary: true,
		warnIfMultipleEnvsConfiguredButNoneSpecified: true,
		suggestSkillsAfterHandler: true,
	},
	args: {
		key: {
			describe: "The variable name to be accessible in the Worker",
			type: "string",
			demandOption: true,
		},
		name: {
			describe:
				"Name of the Worker. If this is not specified, it will default to the name specified in your Wrangler config file.",
			type: "string",
			requiresArg: true,
		},
		"legacy-env": {
			type: "boolean",
			describe: "Use legacy environments",
			hidden: true,
		},
	},
	async handler(args, { config }) {
		if (config.pages_build_output_dir) {
			throw new UserError(
				"It looks like you've run a Workers-specific command in a Pages project.\n" +
					"For Pages, please run `wrangler pages secret put` instead.",
				{ telemetryMessage: "secret put pages project" }
			);
		}

		const isServiceEnv = Boolean(useServiceEnvironments(config) && args.env);

		const scriptName = getLegacyScriptName(args, config);
		if (!scriptName) {
			throw new UserError(
				`Required Worker name missing. Please specify the Worker name in your ${configFileName(config.configPath)} file, or pass it as an argument with \`--name <worker-name>\``,
				{ telemetryMessage: "secret put missing worker name" }
			);
		}

		const accountId = await requireAuth(config);

		const isInteractive = process.stdin.isTTY;
		const secretValue = trimTrailingWhitespace(
			isInteractive
				? await prompt("Enter a secret value:", { isSecret: true })
				: await readFromStdin()
		);

		logger.log(
			`🌀 Creating the secret for the Worker "${scriptName}" ${
				isServiceEnv ? `(${args.env})` : ""
			}`
		);

		async function submitSecret() {
			const url = isServiceEnv
				? `/accounts/${accountId}/workers/services/${scriptName}/environments/${args.env}/secrets`
				: `/accounts/${accountId}/workers/scripts/${scriptName}/secrets`;

			try {
				return await fetchResult(config, url, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name: args.key,
						text: secretValue,
						type: "secret_text",
					}),
				});
			} catch (e) {
				if (e instanceof APIError && e.code === VERSION_NOT_DEPLOYED_ERR_CODE) {
					throw new UserError(
						"Secret edit failed. You attempted to modify a secret, but the latest version of your Worker isn't currently deployed.\n" +
							"This limitation exists to prevent accidental deployment when using Worker versions and secrets together.\n" +
							"To resolve this, you have two options:\n" +
							"(1) use the `wrangler versions secret put` instead, which allows you to update secrets without deploying; or\n" +
							"(2) deploy the latest version first, then modify secrets.\n" +
							"Alternatively, you can use the Cloudflare dashboard to modify secrets and deploy the version.",
						{ telemetryMessage: "secret put version not deployed" }
					);
				} else {
					throw e;
				}
			}
		}

		try {
			await submitSecret();
			metrics.sendMetricsEvent(
				"create encrypted variable",
				{
					secretOperation: "single",
					secretSource: isInteractive ? "interactive" : "stdin",
					hasEnvironment: Boolean(args.env),
				},
				{
					sendMetrics: config.send_metrics,
				}
			);
		} catch (e) {
			if (isWorkerNotFoundError(e)) {
				// create a draft worker and try again
				const result = await createDraftWorker({
					config,
					args,
					accountId,
					scriptName,
				});
				if (result === null) {
					return;
				}
				await submitSecret();
				// TODO: delete the draft worker if this failed too?
			} else {
				throw e;
			}
		}

		logger.log(`✨ Success! Uploaded secret ${args.key}`);
	},
});

export const secretDeleteCommand = createCommand({
	metadata: {
		description: "Delete a secret from a Worker",
		status: "stable",
		owner: "Workers: Deploy and Config",
	},
	positionalArgs: ["key"],
	behaviour: {
		supportTemporary: true,
		warnIfMultipleEnvsConfiguredButNoneSpecified: true,
		suggestSkillsAfterHandler: true,
	},
	args: {
		key: {
			describe: "The variable name to be accessible in the Worker",
			type: "string",
			demandOption: true,
		},
		name: {
			describe:
				"Name of the Worker. If this is not specified, it will default to the name specified in your Wrangler config file.",
			type: "string",
			requiresArg: true,
		},
		"legacy-env": {
			type: "boolean",
			describe: "Use legacy environments",
			hidden: true,
		},
	},
	async handler(args, { config }) {
		const isServiceEnv = useServiceEnvironments(config) && args.env;
		if (config.pages_build_output_dir) {
			throw new UserError(
				"It looks like you've run a Workers-specific command in a Pages project.\n" +
					"For Pages, please run `wrangler pages secret delete` instead.",
				{ telemetryMessage: "secret delete pages project" }
			);
		}

		const scriptName = getLegacyScriptName(args, config);
		if (!scriptName) {
			throw new UserError(
				`Required Worker name missing. Please specify the Worker name in your ${configFileName(config.configPath)} file, or pass it as an argument with \`--name <worker-name>\``,
				{ telemetryMessage: "secret delete missing worker name" }
			);
		}

		const accountId = await requireAuth(config);

		if (
			await confirm(
				`Are you sure you want to permanently delete the secret ${
					args.key
				} on the Worker ${scriptName}${isServiceEnv ? ` (${args.env})` : ""}?`
			)
		) {
			logger.log(
				`🌀 Deleting the secret ${args.key} on the Worker ${scriptName}${
					isServiceEnv ? ` (${args.env})` : ""
				}`
			);

			const url = isServiceEnv
				? `/accounts/${accountId}/workers/services/${scriptName}/environments/${args.env}/secrets`
				: `/accounts/${accountId}/workers/scripts/${scriptName}/secrets`;

			await fetchResult(
				config,
				`${url}/${encodeURIComponent(args.key)}`,
				{ method: "DELETE" },
				new URLSearchParams({
					url_encoded: "true",
				})
			);
			metrics.sendMetricsEvent("delete encrypted variable", {
				sendMetrics: config.send_metrics,
			});
			logger.log(`✨ Success! Deleted secret ${args.key}`);
		}
	},
});

export const secretListCommand = createCommand({
	metadata: {
		description: "List all secrets for a Worker",
		status: "stable",
		owner: "Workers: Deploy and Config",
	},
	args: {
		name: {
			describe:
				"Name of the Worker. If this is not specified, it will default to the name specified in your Wrangler config file.",

			type: "string",
			requiresArg: true,
		},
		format: {
			default: "json",
			choices: ["json", "pretty"],
			describe: "The format to print the secrets in",
		},
		"legacy-env": {
			type: "boolean",
			describe: "Use legacy environments",
			hidden: true,
		},
	},
	behaviour: {
		supportTemporary: true,
		printBanner: (args) => args.format === "pretty",
		suggestSkillsAfterHandler: (args) => args.format === "pretty",
	},
	async handler(args, { config }) {
		if (config.pages_build_output_dir) {
			throw new UserError(
				"It looks like you've run a Workers-specific command in a Pages project.\n" +
					"For Pages, please run `wrangler pages secret list` instead.",
				{ telemetryMessage: "secret list pages project" }
			);
		}

		const scriptName = getLegacyScriptName(args, config);
		if (!scriptName) {
			throw new UserError(
				`Required Worker name missing. Please specify the Worker name in your ${configFileName(config.configPath)} file, or pass it as an argument with \`--name <worker-name>\``,
				{ telemetryMessage: "secret list missing worker name" }
			);
		}

		const accountId = await requireAuth(config);
		let secrets: Awaited<ReturnType<typeof fetchSecrets>>;

		try {
			secrets = await fetchSecrets(
				{ ...config, name: scriptName },
				accountId,
				args.env
			);
		} catch (e) {
			if (isWorkerNotFoundError(e)) {
				throw new UserError(
					`Worker "${scriptName}"${args.env ? ` (env: ${args.env})` : ""} not found.\n\n` +
						`If this is a new Worker, run \`wrangler deploy\` first to create it.\n` +
						`Otherwise, check that the Worker name is correct and you're logged into the right account.`,
					{ telemetryMessage: "secret list worker not found" }
				);
			}

			throw e;
		}

		if (args.format === "pretty") {
			for (const workerSecret of secrets) {
				logger.log(`Secret Name: ${workerSecret.name}\n`);
			}
		} else {
			logger.log(JSON.stringify(secrets, null, "  "));
		}
		metrics.sendMetricsEvent("list encrypted variables", {
			sendMetrics: config.send_metrics,
		});
	},
});

async function putBulkSecrets(
	config: Config,
	accountId: string,
	scriptName: string,
	environment: string | undefined,
	content: Record<string, string | null>,
	options: {
		isServiceEnv?: boolean;
	} = {}
): Promise<[unknown, Array<string>, Array<string>]> {
	const isServiceEnv = options?.isServiceEnv;
	const url = isServiceEnv
		? `/accounts/${accountId}/workers/services/${scriptName}/environments/${environment}/secrets-bulk`
		: `/accounts/${accountId}/workers/scripts/${scriptName}/secrets-bulk`;
	// Build the merge-patch body using JSON Merge Patch (RFC 7396) semantics:
	// - Included secrets are created or updated
	// - Omitted secrets are left unchanged
	// - Secrets set to null are deleted
	const secretEntries = Object.entries(content);
	const secrets: Record<string, SecretBindingUpload | null> = {};
	const toCreate: Array<string> = [];
	const toDelete: Array<string> = [];
	for (const [key, value] of secretEntries) {
		if (value != null) {
			toCreate.push(key);
			secrets[key] = { name: key, text: value, type: "secret_text" };
		} else {
			toDelete.push(key);
			secrets[key] = null;
		}
	}
	const resp = await fetchResult(config, url, {
		method: "PATCH",
		headers: { "Content-Type": "application/merge-patch+json" },
		body: JSON.stringify({ secrets }),
	});
	return [resp, toCreate, toDelete];
}

export const secretBulkCommand = createCommand({
	metadata: {
		description:
			"Create, update, or delete multiple secrets for a Worker in a single request, with up to 100 secrets per command.",
		status: "stable",
		owner: "Workers: Deploy and Config",
	},
	positionalArgs: ["file"],
	behaviour: {
		supportTemporary: true,
		warnIfMultipleEnvsConfiguredButNoneSpecified: true,
		suggestSkillsAfterHandler: true,
	},
	args: {
		file: {
			describe: `The file of key-value pairs to create, update, or delete, as JSON in form {"key": "value", ...} or .env file in the form KEY=VALUE. Set a key to null in the JSON file to delete it. Deletion is not supported with .env files. If omitted, Wrangler expects to receive input from stdin rather than a file.`,
			type: "string",
		},
		name: {
			describe:
				"Name of the Worker. If this is not specified, it will default to the name specified in your Wrangler config file.",

			type: "string",
			requiresArg: true,
		},
		"legacy-env": {
			type: "boolean",
			describe: "Use legacy environments",
			hidden: true,
		},
	},
	async handler(args, { config }) {
		if (config.pages_build_output_dir) {
			throw new UserError(
				"It looks like you've run a Workers-specific command in a Pages project.\n" +
					"For Pages, please run `wrangler pages secret bulk` instead.",
				{ telemetryMessage: "secret bulk pages project" }
			);
		}

		const isServiceEnv = useServiceEnvironments(config) && !!args.env;
		const scriptName = getLegacyScriptName(args, config);
		if (!scriptName) {
			const error = new UserError(
				`Required Worker name missing. Please specify the Worker name in your ${configFileName(config.configPath)} file, or pass it as an argument with \`--name <worker-name>\``,
				{ telemetryMessage: "secret bulk missing worker name" }
			);
			logger.error(error.message);
			throw error;
		}

		const accountId = await requireAuth(config);

		logger.log(
			`🌀 Processing the secrets for the Worker "${scriptName}" ${
				isServiceEnv ? `(${args.env})` : ""
			}`
		);

		const result = await parseBulkInputToObject(args.file, true);

		if (!result) {
			return logger.error(`🚨 No content found in file, or piped input.`);
		}

		const { content, secretSource, secretFormat } = result;
		const hasSecretsToCreate = Object.values(content).some(
			(value) => value != null
		);

		let created: Array<string> = [];
		let deleted: Array<string> = [];
		try {
			try {
				[, created, deleted] = await putBulkSecrets(
					config,
					accountId,
					scriptName,
					args.env,
					content,
					{ isServiceEnv }
				);
			} catch (e) {
				if (!isWorkerNotFoundError(e)) {
					throw e;
				}
				if (!hasSecretsToCreate) {
					throw e;
				}
				// Worker doesn't exist yet — create a draft worker, then retry
				const draftWorkerResult = await createDraftWorker({
					config,
					args,
					accountId,
					scriptName,
				});
				if (draftWorkerResult === null) {
					return;
				}
				[, created, deleted] = await putBulkSecrets(
					config,
					accountId,
					scriptName,
					args.env,
					content,
					{ isServiceEnv }
				);
			}
		} catch (e) {
			logger.log("");
			logger.log(`🚨 Secrets failed to upload`);
			throw e;
		}

		for (const key of deleted) {
			logger.log(`💥 Successfully deleted secret for key: ${key}`);
		}
		for (const key of created) {
			logger.log(`✨ Successfully created secret for key: ${key}`);
		}

		logger.log("");
		logger.log("Finished processing secrets file:");
		const hasChanges = deleted.length + created.length > 0;
		if (hasChanges) {
			if (deleted.length > 0) {
				logger.log(`💥 ${deleted.length} secrets successfully deleted`);
			}
			if (created.length > 0) {
				logger.log(`✨ ${created.length} secrets successfully created`);
			}
		} else {
			logger.log(`No secrets were created or deleted`);
		}

		metrics.sendMetricsEvent(
			"create encrypted variable",
			{
				secretOperation: "bulk",
				secretSource,
				secretFormat,
				hasEnvironment: Boolean(args.env),
			},
			{
				sendMetrics: config.send_metrics,
			}
		);
	},
});

export {
	validateFileSecrets,
	NoInputError,
	parseBulkInputToObject,
} from "@cloudflare/deploy-helpers";
export type {
	BulkInputResult,
	BulkInputNullableResult,
} from "@cloudflare/deploy-helpers";
