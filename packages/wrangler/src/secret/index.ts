import path from "node:path";
import readline from "node:readline";
import {
	APIError,
	configFileName,
	FatalError,
	parseJSON,
	readFileSync,
	UserError,
} from "@cloudflare/workers-utils";
import { parse as dotenvParse } from "dotenv";
import { FormData } from "undici";
import { fetchResult } from "../cfetch";
import { createCommand, createNamespace } from "../core/create-command";
import { createWorkerUploadForm } from "../deployment-bundle/create-worker-upload-form";
import { confirm, prompt } from "../dialogs";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { fetchSecrets } from "../utils/fetch-secrets";
import { getLegacyScriptName } from "../utils/getLegacyScriptName";
import { readFromStdin, trimTrailingWhitespace } from "../utils/std";
import { useServiceEnvironments } from "../utils/useServiceEnvironments";
import type { Config, WorkerMetadataBinding } from "@cloudflare/workers-utils";

export const VERSION_NOT_DEPLOYED_ERR_CODE = 10215;

type SecretBindingUpload = {
	type: "secret_text";
	name: string;
	text: string;
};

type InheritBindingUpload = {
	type: (WorkerMetadataBinding | SecretBindingRedacted)["type"];
	name: string;
};

type SecretBindingRedacted = Omit<SecretBindingUpload, "text">;

function isMissingWorkerError(e: unknown): e is { code: 10007 } {
	return (
		typeof e === "object" &&
		e !== null &&
		(e as { code: number }).code === 10007
	);
}

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
			body: createWorkerUploadForm({
				name: scriptName,
				main: {
					name: scriptName,
					filePath: undefined,
					content: `export default { fetch() {} }`,
					type: "esm",
				},
				bindings: {
					kv_namespaces: [],
					send_email: [],
					vars: {},
					durable_objects: { bindings: [] },
					workflows: [],
					queues: [],
					r2_buckets: [],
					d1_databases: [],
					vectorize: [],
					hyperdrive: [],
					secrets_store_secrets: [],
					services: [],
					vpc_services: [],
					analytics_engine_datasets: [],
					wasm_modules: {},
					browser: undefined,
					ai: undefined,
					images: undefined,
					version_metadata: undefined,
					text_blobs: {},
					data_blobs: {},
					dispatch_namespaces: [],
					mtls_certificates: [],
					pipelines: [],
					logfwdr: { bindings: [] },
					ratelimits: [],
					assets: undefined,
					unsafe: {
						bindings: undefined,
						metadata: undefined,
						capnp: undefined,
					},
					unsafe_hello_world: [],
					worker_loaders: [],
					media: undefined,
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
				observability: undefined,
			}),
		}
	);
}
export const secretNamespace = createNamespace({
	metadata: {
		description: "🤫 Generate a secret that can be referenced in a Worker",
		status: "stable",
		owner: "Workers: Deploy and Config",
	},
});
export const secretPutCommand = createCommand({
	metadata: {
		description: "Create or update a secret variable for a Worker",
		status: "stable",
		owner: "Workers: Deploy and Config",
	},
	positionalArgs: ["key"],
	behaviour: {
		warnIfMultipleEnvsConfiguredButNoneSpecified: true,
	},
	args: {
		key: {
			describe: "The variable name to be accessible in the Worker",
			type: "string",
			demandOption: true,
		},
		name: {
			describe: "Name of the Worker",
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
					"For Pages, please run `wrangler pages secret put` instead."
			);
		}

		const isServiceEnv = Boolean(useServiceEnvironments(config) && args.env);

		const scriptName = getLegacyScriptName(args, config);
		if (!scriptName) {
			throw new UserError(
				`Required Worker name missing. Please specify the Worker name in your ${configFileName(config.configPath)} file, or pass it as an argument with \`--name <worker-name>\``
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
						"Secret edit failed. You attempted to modify a secret, but the latest version of your Worker isn't currently deployed. " +
							"Please ensure that the latest version of your Worker is fully deployed " +
							"(wrangler versions deploy) before modifying secrets. " +
							"Alternatively, you can use the Cloudflare dashboard to modify secrets and deploy the version." +
							"\n\nNote: This limitation will be addressed in an upcoming release."
					);
				} else {
					throw e;
				}
			}
		}

		try {
			await submitSecret();
			metrics.sendMetricsEvent("create encrypted variable", {
				sendMetrics: config.send_metrics,
			});
		} catch (e) {
			if (isMissingWorkerError(e)) {
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
		description: "Delete a secret variable from a Worker",
		status: "stable",
		owner: "Workers: Deploy and Config",
	},
	positionalArgs: ["key"],
	behaviour: {
		warnIfMultipleEnvsConfiguredButNoneSpecified: true,
	},
	args: {
		key: {
			describe: "The variable name to be accessible in the Worker",
			type: "string",
			demandOption: true,
		},
		name: {
			describe: "Name of the Worker",
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
					"For Pages, please run `wrangler pages secret delete` instead."
			);
		}

		const scriptName = getLegacyScriptName(args, config);
		if (!scriptName) {
			throw new UserError(
				`Required Worker name missing. Please specify the Worker name in your ${configFileName(config.configPath)} file, or pass it as an argument with \`--name <worker-name>\``
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
			describe: "Name of the Worker",
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
		printBanner: (args) => args.format === "pretty",
	},
	async handler(args, { config }) {
		if (config.pages_build_output_dir) {
			throw new UserError(
				"It looks like you've run a Workers-specific command in a Pages project.\n" +
					"For Pages, please run `wrangler pages secret list` instead."
			);
		}

		const scriptName = getLegacyScriptName(args, config);
		if (!scriptName) {
			throw new UserError(
				`Required Worker name missing. Please specify the Worker name in your ${configFileName(config.configPath)} file, or pass it as an argument with \`--name <worker-name>\``
			);
		}

		const secrets = await fetchSecrets(
			{ ...config, name: scriptName },
			args.env
		);

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

export const secretBulkCommand = createCommand({
	metadata: {
		description: "Bulk upload secrets for a Worker",
		status: "stable",
		owner: "Workers: Deploy and Config",
	},
	positionalArgs: ["file"],
	behaviour: {
		warnIfMultipleEnvsConfiguredButNoneSpecified: true,
	},
	args: {
		file: {
			describe: `The file of key-value pairs to upload, as JSON in form {"key": value, ...} or .dev.vars file in the form KEY=VALUE`,
			type: "string",
		},
		name: {
			describe: "Name of the Worker",
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
					"For Pages, please run `wrangler pages secret bulk` instead."
			);
		}

		const isServiceEnv = useServiceEnvironments(config) && args.env;
		const scriptName = getLegacyScriptName(args, config);
		if (!scriptName) {
			const error = new UserError(
				`Required Worker name missing. Please specify the Worker name in your ${configFileName(config.configPath)} file, or pass it as an argument with \`--name <worker-name>\``
			);
			logger.error(error.message);
			throw error;
		}

		const accountId = await requireAuth(config);

		logger.log(
			`🌀 Creating the secrets for the Worker "${scriptName}" ${
				isServiceEnv ? `(${args.env})` : ""
			}`
		);

		const content = await parseBulkInputToObject(args.file);

		if (!content) {
			return logger.error(`🚨 No content found in file, or piped input.`);
		}

		function getSettings() {
			const url = isServiceEnv
				? `/accounts/${accountId}/workers/services/${scriptName}/environments/${args.env}/settings`
				: `/accounts/${accountId}/workers/scripts/${scriptName}/settings`;

			return fetchResult<{
				bindings: Array<WorkerMetadataBinding | SecretBindingRedacted>;
			}>(config, url);
		}

		function putBindingsSettings(
			bindings: Array<SecretBindingUpload | InheritBindingUpload>
		) {
			const url = isServiceEnv
				? `/accounts/${accountId}/workers/services/${scriptName}/environments/${args.env}/settings`
				: `/accounts/${accountId}/workers/scripts/${scriptName}/settings`;

			const data = new FormData();
			data.set("settings", JSON.stringify({ bindings }));
			return fetchResult(config, url, {
				method: "PATCH",
				body: data,
			});
		}

		let existingBindings: Array<WorkerMetadataBinding | SecretBindingRedacted>;
		try {
			const settings = await getSettings();
			existingBindings = settings.bindings;
		} catch (e) {
			if (isMissingWorkerError(e)) {
				// create a draft worker before patching
				const result = await createDraftWorker({
					config,
					args: args,
					accountId,
					scriptName,
				});
				if (result === null) {
					return;
				}
				existingBindings = [];
			} else {
				throw e;
			}
		}
		// any existing bindings can be "inherited" from the previous deploy via the PATCH settings api
		// by just providing the "name" and "type" fields for the binding.
		// so after fetching the bindings in the script settings, we can map over and just pick out those fields
		const inheritBindings = existingBindings
			.filter((binding) => {
				// secrets that currently exist for the worker but are not provided for bulk update
				// are inherited over with other binding types
				return (
					binding.type !== "secret_text" || content[binding.name] === undefined
				);
			})
			.map((binding) => ({ type: binding.type, name: binding.name }));
		// secrets to upload are provided as bindings in their full form
		// so when we PATCH, we patch in [...current bindings, ...updated / new secrets]
		const upsertBindings: Array<SecretBindingUpload> = Object.entries(
			content
		).map(([key, value]) => {
			return {
				type: "secret_text",
				name: key,
				text: value,
			};
		});
		try {
			await putBindingsSettings(inheritBindings.concat(upsertBindings));
			for (const upsertedBinding of upsertBindings) {
				logger.log(
					`✨ Successfully created secret for key: ${upsertedBinding.name}`
				);
			}
			logger.log("");
			logger.log("Finished processing secrets file:");
			logger.log(`✨ ${upsertBindings.length} secrets successfully uploaded`);
		} catch (err) {
			logger.log("");
			logger.log(`🚨 Secrets failed to upload`);
			throw err;
		}
	},
});

export function validateFileSecrets(
	content: unknown,
	jsonFilePath: string
): asserts content is Record<string, string> {
	if (content === null || typeof content !== "object") {
		throw new FatalError(
			`The contents of "${jsonFilePath}" is not valid. It should be a JSON object of string values.`
		);
	}
	const entries = Object.entries(content);
	for (const [key, value] of entries) {
		if (typeof value !== "string") {
			throw new FatalError(
				`The value for "${key}" in "${jsonFilePath}" is not a "string" instead it is of type "${typeof value}"`
			);
		}
	}
}

export async function parseBulkInputToObject(input?: string) {
	let content: Record<string, string>;
	if (input) {
		const jsonFilePath = path.resolve(input);
		try {
			const fileContent = readFileSync(jsonFilePath);
			try {
				content = parseJSON(fileContent) as Record<string, string>;
			} catch (e) {
				content = dotenvParse(fileContent);
				// dotenvParse does not error unless fileContent is undefined, no keys === error
				if (Object.keys(content).length === 0) {
					throw e;
				}
			}
		} catch (e) {
			throw new FatalError(
				`The contents of "${input}" is not valid JSON: "${e}"`
			);
		}
		validateFileSecrets(content, input);
	} else {
		try {
			const rl = readline.createInterface({ input: process.stdin });
			let pipedInput = "";
			for await (const line of rl) {
				pipedInput += line;
			}
			try {
				content = parseJSON(pipedInput) as Record<string, string>;
			} catch (e) {
				content = dotenvParse(pipedInput);
				// dotenvParse does not error unless fileContent is undefined, no keys === error
				if (Object.keys(content).length === 0) {
					throw e;
				}
			}
		} catch {
			return;
		}
	}
	return content;
}
