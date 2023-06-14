import path from "node:path";
import { fetchResult } from "../cfetch";
import { readConfig } from "../config";
import { createWorkerUploadForm } from "../create-worker-upload-form";
import { confirm, prompt } from "../dialogs";
import {
	getLegacyScriptName,
	isLegacyEnv,
	printWranglerBanner,
} from "../index";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { parseJSON, readFileSync } from "../parse";
import { requireAuth } from "../user";

import { secretKeyWizard } from "./secretKey";
import { SecretBindingType, type CreateSecretBody, type SecretBulkArgs } from './types';
import { readFromStdin, trimTrailingWhitespace } from "./util";
import type {
	CommonYargsArgv,
} from "../yargs-types";

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
					})
					.option("type", {
						describe: `Type of secret, options are: ${Object.keys(
							SecretBindingType
						).join(", ")}`,
						type: "string",
						requiresArg: true,
						default: "text",
					});
			},
			async (args) => {
				await printWranglerBanner();
				const config = readConfig(args.config, args);

				const scriptName = getLegacyScriptName(args, config);
				if (!scriptName) {
					throw new Error(
						"Required Worker name missing. Please specify the Worker name in wrangler.toml, or pass it as an argument with `--name <worker-name>`"
					);
				}

				const accountId = await requireAuth(config);

				const isInteractive = process.stdin.isTTY;

				const secretType = args.type;
				let createSecretBody: CreateSecretBody;
				switch (secretType) {
					case SecretBindingType.text: {
						const secretValue = trimTrailingWhitespace(
							isInteractive
								? await prompt("Enter a secret value:", { isSecret: true })
								: await readFromStdin()
						);
						createSecretBody = {
							name: args.key,
							type: "secret_text",
							text: secretValue,
						};
						break;
					}
					case SecretBindingType.key: {
						createSecretBody = await secretKeyWizard(
							args.key ?? "",
							isInteractive
						);
						break;
					}
					default: {
						throw new Error(
							`Unrecognized secret type. Must be one of: ${Object.keys(
								SecretBindingType
							).join(", ")}`
						);
					}
				}

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

					return await fetchResult(url, {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(createSecretBody),
					});
				}

				const createDraftWorker = async () => {
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
									constellation: [],
									services: [],
									analytics_engine_datasets: [],
									wasm_modules: {},
									browser: undefined,
									text_blobs: {},
									data_blobs: {},
									dispatch_namespaces: [],
									mtls_certificates: [],
									logfwdr: { schema: undefined, bindings: [] },
									unsafe: { bindings: undefined, metadata: undefined },
								},
								modules: [],
								migrations: undefined,
								compatibility_date: undefined,
								compatibility_flags: undefined,
								usage_model: undefined,
								keepVars: false, // this doesn't matter since it's a new script anyway
								logpush: false,
								placement: undefined,
								tail_consumers: undefined,
							}),
						}
					);
				};

				function isMissingWorkerError(e: unknown): e is { code: 10007 } {
					return (
						typeof e === "object" &&
						e !== null &&
						(e as { code: number }).code === 10007
					);
				}

				try {
					await submitSecret();
					await metrics.sendMetricsEvent("create encrypted variable", {
						sendMetrics: config.send_metrics,
					});
				} catch (e) {
					if (isMissingWorkerError(e)) {
						// create a draft worker and try again
						await createDraftWorker();
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
					throw new Error(
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
				return yargs.option("name", {
					describe: "Name of the Worker",
					type: "string",
					requiresArg: true,
				});
			},
			async (args) => {
				const config = readConfig(args.config, args);

				const scriptName = getLegacyScriptName(args, config);
				if (!scriptName) {
					throw new Error(
						"Required Worker name missing. Please specify the Worker name in wrangler.toml, or pass it as an argument with `--name <worker-name>`"
					);
				}

				const accountId = await requireAuth(config);

				const url =
					!args.env || isLegacyEnv(config)
						? `/accounts/${accountId}/workers/scripts/${scriptName}/secrets`
						: `/accounts/${accountId}/workers/services/${scriptName}/environments/${args.env}/secrets`;

				logger.log(JSON.stringify(await fetchResult(url), null, "  "));
				await metrics.sendMetricsEvent("list encrypted variables", {
					sendMetrics: config.send_metrics,
				});
			}
		);
};

export const secretBulkHandler = async (secretBulkArgs: SecretBulkArgs) => {
	await printWranglerBanner();
	const config = readConfig(secretBulkArgs.config, secretBulkArgs);

	const scriptName = getLegacyScriptName(secretBulkArgs, config);
	if (!scriptName) {
		throw new Error(
			"Required Worker name missing. Please specify the Worker name in wrangler.toml, or pass it as an argument with `--name <worker-name>`"
		);
	}

	const accountId = await requireAuth(config);

	logger.log(
		`🌀 Creating the secrets for the Worker "${scriptName}" ${
			secretBulkArgs.env && !isLegacyEnv(config)
				? `(${secretBulkArgs.env})`
				: ""
		}`
	);
	const jsonFilePath = path.resolve(secretBulkArgs.json);
	const content = parseJSON<Record<string, string>>(
		readFileSync(jsonFilePath),
		jsonFilePath
	);
	for (const key in content) {
		if (typeof content[key] !== "string") {
			throw new Error(
				`The value for ${key} in ${jsonFilePath} is not a string.`
			);
		}
	}

	const url =
		!secretBulkArgs.env || isLegacyEnv(config)
			? `/accounts/${accountId}/workers/scripts/${scriptName}/secrets`
			: `/accounts/${accountId}/workers/services/${scriptName}/environments/${secretBulkArgs.env}/secrets`;
	// Until we have a bulk route for secrets, we need to make a request for each key/value pair
	const bulkOutcomes = await Promise.all(
		Object.entries(content).map(async ([key, value]) => {
			return fetchResult(url, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: key,
					text: value,
					type: "secret_text",
				}),
			})
				.then(() => {
					logger.log(`✨ Successfully created secret for key: ${key}`);
					return true;
				})
				.catch((e) => {
					logger.error(
						`🚨 Error uploading secret for key: ${key}:
                ${e.message}`
					);
					return false;
				});
		})
	);
	const successes = bulkOutcomes.filter((outcome) => outcome).length;
	const failures = bulkOutcomes.length - successes;
	logger.log("");
	logger.log("Finished processing secrets JSON file:");
	logger.log(`✨ ${successes} secrets successfully uploaded`);
	if (failures > 0) {
		logger.log(`🚨 ${failures} secrets failed to upload`);
	}
};
