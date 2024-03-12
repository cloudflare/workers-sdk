import path from "node:path";
import readline from "node:readline";
import { FormData } from "undici";
import { fetchResult } from "../cfetch";
import { readConfig } from "../config";
import { createWorkerUploadForm } from "../deployment-bundle/create-worker-upload-form";
import { confirm, prompt } from "../dialogs";
import { UserError } from "../errors";
import {
	getLegacyScriptName,
	isLegacyEnv,
	printWranglerBanner,
} from "../index";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { parseJSON, readFileSync } from "../parse";
import { requireAuth } from "../user";
import type { Config } from "../config";
import type { WorkerMetadataBinding } from "../deployment-bundle/create-worker-upload-form";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

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
					constellation: [],
					services: [],
					analytics_engine_datasets: [],
					wasm_modules: {},
					browser: undefined,
					ai: undefined,
					text_blobs: {},
					data_blobs: {},
					dispatch_namespaces: [],
					mtls_certificates: [],
					logfwdr: { bindings: [] },
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
				usage_model: undefined,
				keepVars: false, // this doesn't matter since it's a new script anyway
				logpush: false,
				placement: undefined,
				tail_consumers: undefined,
				limits: undefined,
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
			"🔸Create or update a secret variable for a Worker",
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

					return await fetchResult(url, {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							name: args.key,
							text: secretValue,
							type: "secret_text",
						}),
					});
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
			"🔸Delete a secret variable from a Worker",
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
			"🔸List all secrets for a Worker",
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
					throw new UserError(
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

/**
 * Remove trailing white space from inputs.
 * Matching Wrangler legacy behavior with handling inputs
 */
function trimTrailingWhitespace(str: string) {
	return str.trimEnd();
}

/**
 * Get a promise to the streamed input from stdin.
 *
 * This function can be used to grab the incoming stream of data from, say,
 * piping the output of another process into the wrangler process.
 */
function readFromStdin(): Promise<string> {
	return new Promise((resolve, reject) => {
		const stdin = process.stdin;
		const chunks: string[] = [];

		// When there is data ready to be read, the `readable` event will be triggered.
		// In the handler for `readable` we call `read()` over and over until all the available data has been read.
		stdin.on("readable", () => {
			let chunk;
			while (null !== (chunk = stdin.read())) {
				chunks.push(chunk);
			}
		});

		// When the streamed data is complete the `end` event will be triggered.
		// In the handler for `end` we join the chunks together and resolve the promise.
		stdin.on("end", () => {
			resolve(chunks.join(""));
		});

		// If there is an `error` event then the handler will reject the promise.
		stdin.on("error", (err) => {
			reject(err);
		});
	});
}

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
		content = parseJSON<Record<string, string>>(
			readFileSync(jsonFilePath),
			jsonFilePath
		);
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
