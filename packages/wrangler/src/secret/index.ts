import path from "node:path";
import readline from "node:readline";
import { FormData } from "undici";
import { fetchResult } from "../cfetch";
import { readConfig } from "../config";
import { createWorkerUploadForm } from "../deployment-bundle/create-worker-upload-form";
import { confirm, prompt } from "../dialogs";
import { FatalError, UserError } from "../errors";
import {
	getLegacyScriptName,
	isLegacyEnv,
	printWranglerBanner,
} from "../index";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { APIError, parseJSON, readFileSync } from "../parse";
import { requireAuth } from "../user";
import { readFromStdin, trimTrailingWhitespace } from "../utils/std";
import type { Config } from "../config";
import type { WorkerMetadataBinding } from "../deployment-bundle/create-worker-upload-form";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

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
	// TODO: log a warning
	await fetchResult(
		!isLegacyEnv(config) && args.env
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
					queues: [],
					r2_buckets: [],
					d1_databases: [],
					vectorize: [],
					hyperdrive: [],
					services: [],
					analytics_engine_datasets: [],
					wasm_modules: {},
					browser: undefined,
					ai: undefined,
					version_metadata: undefined,
					text_blobs: {},
					data_blobs: {},
					dispatch_namespaces: [],
					mtls_certificates: [],
					pipelines: [],
					logfwdr: { bindings: [] },
					assets: undefined,
					unsafe: {
						bindings: undefined,
						metadata: undefined,
						capnp: undefined,
					},
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

export const secret = (secretYargs: CommonYargsArgv) => {
	return secretYargs
		.option("legacy-env", {
			type: "boolean",
			describe: "Use legacy environments",
			hidden: true,
		})
		.command(
			"put <key>",
			"Create or update a secret variable for a Worker",
			(yargs) => {
				return yargs
					.positional("key", {
						describe: "The variable name to be accessible in the Worker",
						type: "string",
					})
					.option("name", {
						describe: "Name of the Worker",
						type: "string",
						requiresArg: true,
					});
			},
			async (args) => {
				await printWranglerBanner();
				const config = readConfig(args.config, args);

				const scriptName = getLegacyScriptName(args, config);
				if (!scriptName) {
					throw new UserError(
						"Required Worker name missing. Please specify the Worker name in wrangler.toml, or pass it as an argument with `--name <worker-name>`"
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
						args.env && !isLegacyEnv(config) ? `(${args.env})` : ""
					}`
				);

				async function submitSecret() {
					const url =
						!args.env || isLegacyEnv(config)
							? `/accounts/${accountId}/workers/scripts/${scriptName}/secrets`
							: `/accounts/${accountId}/workers/services/${scriptName}/environments/${args.env}/secrets`;

					try {
						return await fetchResult(url, {
							method: "PUT",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								name: args.key,
								text: secretValue,
								type: "secret_text",
							}),
						});
					} catch (e) {
						if (
							e instanceof APIError &&
							e.code === VERSION_NOT_DEPLOYED_ERR_CODE
						) {
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
					await metrics.sendMetricsEvent("create encrypted variable", {
						sendMetrics: config.send_metrics,
					});
				} catch (e) {
					if (isMissingWorkerError(e)) {
						// create a draft worker and try again
						await createDraftWorker({
							config,
							args,
							accountId,
							scriptName,
						});
						await submitSecret();
						// TODO: delete the draft worker if this failed too?
					} else {
						throw e;
					}
				}

				logger.log(`✨ Success! Uploaded secret ${args.key}`);
			}
		)
		.command(
			"delete <key>",
			"Delete a secret variable from a Worker",
			async (yargs) => {
				await printWranglerBanner();
				return yargs
					.positional("key", {
						describe: "The variable name to be accessible in the Worker",
						type: "string",
					})
					.option("name", {
						describe: "Name of the Worker",
						type: "string",
						requiresArg: true,
					});
			},
			async (args) => {
				const config = readConfig(args.config, args);

				const scriptName = getLegacyScriptName(args, config);
				if (!scriptName) {
					throw new UserError(
						"Required Worker name missing. Please specify the Worker name in wrangler.toml, or pass it as an argument with `--name <worker-name>`"
					);
				}

				const accountId = await requireAuth(config);

				if (
					await confirm(
						`Are you sure you want to permanently delete the secret ${
							args.key
						} on the Worker ${scriptName}${
							args.env && !isLegacyEnv(config) ? ` (${args.env})` : ""
						}?`
					)
				) {
					logger.log(
						`🌀 Deleting the secret ${args.key} on the Worker ${scriptName}${
							args.env && !isLegacyEnv(config) ? ` (${args.env})` : ""
						}`
					);

					const url =
						!args.env || isLegacyEnv(config)
							? `/accounts/${accountId}/workers/scripts/${scriptName}/secrets`
							: `/accounts/${accountId}/workers/services/${scriptName}/environments/${args.env}/secrets`;

					await fetchResult(`${url}/${args.key}`, { method: "DELETE" });
					await metrics.sendMetricsEvent("delete encrypted variable", {
						sendMetrics: config.send_metrics,
					});
					logger.log(`✨ Success! Deleted secret ${args.key}`);
				}
			}
		)
		.command(
			"list",
			"List all secrets for a Worker",
			(yargs) => {
				return yargs
					.option("name", {
						describe: "Name of the Worker",
						type: "string",
						requiresArg: true,
					})
					.option("format", {
						default: "json",
						choices: ["json", "pretty"],
						describe: "The format to print the secrets in",
					});
			},
			async (args) => {
				const config = readConfig(args.config, args);

				const scriptName = getLegacyScriptName(args, config);
				if (!scriptName) {
					throw new UserError(
						"Required Worker name missing. Please specify the Worker name in wrangler.toml, or pass it as an argument with `--name <worker-name>`"
					);
				}

				const accountId = await requireAuth(config);

				const url =
					!args.env || isLegacyEnv(config)
						? `/accounts/${accountId}/workers/scripts/${scriptName}/secrets`
						: `/accounts/${accountId}/workers/services/${scriptName}/environments/${args.env}/secrets`;

				const secrets =
					await fetchResult<{ name: string; type: string }[]>(url);

				if (args.pretty) {
					for (const workerSecret of secrets) {
						logger.log(`Secret Name: ${workerSecret.name}\n`);
					}
				} else {
					logger.log(JSON.stringify(secrets, null, "  "));
				}

				await metrics.sendMetricsEvent("list encrypted variables", {
					sendMetrics: config.send_metrics,
				});
			}
		)
		.command(
			"bulk [json]",
			"Bulk upload secrets for a Worker",
			secretBulkOptions,
			secretBulkHandler
		);
};

// *** Secret Bulk Section Below ***
/**
 * @description Options for the `secret bulk` command.
 */
export const secretBulkOptions = (yargs: CommonYargsArgv) => {
	return yargs
		.positional("json", {
			describe: `The JSON file of key-value pairs to upload, in form {"key": value, ...}`,
			type: "string",
		})
		.option("name", {
			describe: "Name of the Worker",
			type: "string",
			requiresArg: true,
		});
};

type SecretBulkArgs = StrictYargsOptionsToInterface<typeof secretBulkOptions>;

export const secretBulkHandler = async (secretBulkArgs: SecretBulkArgs) => {
	await printWranglerBanner();
	const config = readConfig(secretBulkArgs.config, secretBulkArgs);

	if (secretBulkArgs._.includes("secret:bulk")) {
		logger.warn(
			"`wrangler secret:bulk` is deprecated and will be removed in a future major version.\nPlease use `wrangler secret bulk` instead, which accepts exactly the same arguments."
		);
	}

	const scriptName = getLegacyScriptName(secretBulkArgs, config);
	if (!scriptName) {
		const error = new UserError(
			"Required Worker name missing. Please specify the Worker name in wrangler.toml, or pass it as an argument with `--name <worker-name>`"
		);
		logger.error(error.message);
		throw error;
	}

	const accountId = await requireAuth(config);

	logger.log(
		`🌀 Creating the secrets for the Worker "${scriptName}" ${
			secretBulkArgs.env && !isLegacyEnv(config)
				? `(${secretBulkArgs.env})`
				: ""
		}`
	);

	let content: Record<string, string>;
	if (secretBulkArgs.json) {
		const jsonFilePath = path.resolve(secretBulkArgs.json);
		try {
			content = parseJSON<Record<string, string>>(
				readFileSync(jsonFilePath),
				jsonFilePath
			);
		} catch (e) {
			throw new FatalError(
				`The contents of "${secretBulkArgs.json}" is not valid JSON: "${e}"`
			);
		}
		validateJSONFileSecrets(content, secretBulkArgs.json);
	} else {
		try {
			const rl = readline.createInterface({ input: process.stdin });
			let pipedInput = "";
			for await (const line of rl) {
				pipedInput += line;
			}
			content = parseJSON<Record<string, string>>(pipedInput);
		} catch {
			return logger.error(`🚨 Please provide a JSON file or valid JSON pipe`);
		}
	}

	if (!content) {
		return logger.error(`🚨 No content found in JSON file or piped input.`);
	}

	function getSettings() {
		const url =
			!secretBulkArgs.env || isLegacyEnv(config)
				? `/accounts/${accountId}/workers/scripts/${scriptName}/settings`
				: `/accounts/${accountId}/workers/services/${scriptName}/environments/${secretBulkArgs.env}/settings`;

		return fetchResult<{
			bindings: Array<WorkerMetadataBinding | SecretBindingRedacted>;
		}>(url);
	}

	function putBindingsSettings(
		bindings: Array<SecretBindingUpload | InheritBindingUpload>
	) {
		const url =
			!secretBulkArgs.env || isLegacyEnv(config)
				? `/accounts/${accountId}/workers/scripts/${scriptName}/settings`
				: `/accounts/${accountId}/workers/services/${scriptName}/environments/${secretBulkArgs.env}/settings`;

		const data = new FormData();
		data.set("settings", JSON.stringify({ bindings }));

		return fetchResult(url, {
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
			await createDraftWorker({
				config,
				args: secretBulkArgs,
				accountId,
				scriptName,
			});
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
		logger.log("Finished processing secrets JSON file:");
		logger.log(`✨ ${upsertBindings.length} secrets successfully uploaded`);
	} catch (err) {
		logger.log("");
		logger.log("Finished processing secrets JSON file:");
		logger.log(`✨ 0 secrets successfully uploaded`);
		throw new Error(`🚨 ${upsertBindings.length} secrets failed to upload`);
	}
};

export function validateJSONFileSecrets(
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
