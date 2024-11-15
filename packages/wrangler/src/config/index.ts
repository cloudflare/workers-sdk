import fs from "node:fs";
import TOML from "@iarna/toml";
import chalk from "chalk";
import dotenv from "dotenv";
import { findUpSync } from "find-up";
import { FatalError, UserError } from "../errors";
import { logger } from "../logger";
import { EXIT_CODE_INVALID_PAGES_CONFIG } from "../pages/errors";
import { parseJSONC, parseTOML, readFileSync } from "../parse";
import { isPagesConfig, normalizeAndValidateConfig } from "./validation";
import { validatePagesConfig } from "./validation-pages";
import type { CfWorkerInit } from "../deployment-bundle/worker";
import type { WorkerRegistry } from "../dev-registry";
import type { CommonYargsOptions } from "../yargs-types";
import type { Config, OnlyCamelCase, RawConfig } from "./config";
import type { NormalizeAndValidateConfigArgs } from "./validation";

export type {
	Config,
	ConfigFields,
	DevConfig,
	RawConfig,
	RawDevConfig,
} from "./config";
export type {
	ConfigModuleRuleType,
	Environment,
	RawEnvironment,
} from "./environment";

function configFormat(
	configPath: string | undefined
): "jsonc" | "toml" | "none" {
	if (configPath?.endsWith("toml")) {
		return "toml";
	} else if (configPath?.endsWith("json") || configPath?.endsWith("jsonc")) {
		return "jsonc";
	}
	return "none";
}

export function configFileName(configPath: string | undefined) {
	const format = configFormat(configPath);
	if (format === "toml") {
		return "wrangler.toml";
	} else if (format === "jsonc") {
		return "wrangler.json";
	} else {
		return "Wrangler configuration";
	}
}

export function formatConfigSnippet(
	snippet: RawConfig,
	configPath: Config["configPath"],
	formatted = true
) {
	const format = configFormat(configPath);
	if (format === "toml") {
		return TOML.stringify(snippet as TOML.JsonMap);
	} else {
		return formatted
			? JSON.stringify(snippet, null, 2)
			: JSON.stringify(snippet);
	}
}

type ReadConfigCommandArgs = NormalizeAndValidateConfigArgs;

/**
 * Get the Wrangler configuration; read it from the give `configPath` if available.
 */
export function readConfig(
	configPath: string | undefined,
	// Include command specific args as well as the wrangler global flags
	args: ReadConfigCommandArgs,
	requirePagesConfig: true
): Omit<Config, "pages_build_output_dir"> & { pages_build_output_dir: string };
export function readConfig(
	configPath: string | undefined,
	// Include command specific args as well as the wrangler global flags
	args: ReadConfigCommandArgs,
	requirePagesConfig?: boolean,
	hideWarnings?: boolean
): Config;
export function readConfig(
	configPath: string | undefined,
	// Include command specific args as well as the wrangler global flags
	args: ReadConfigCommandArgs,
	requirePagesConfig?: boolean,
	hideWarnings: boolean = false
): Config {
	let rawConfig: RawConfig = {};

	if (!configPath) {
		configPath = findWranglerConfig(process.cwd());
	}

	try {
		// Load the configuration from disk if available
		if (configPath?.endsWith("toml")) {
			rawConfig = parseTOML(readFileSync(configPath), configPath);
		} else if (configPath?.endsWith("json") || configPath?.endsWith("jsonc")) {
			rawConfig = parseJSONC(readFileSync(configPath), configPath);
		}
	} catch (e) {
		// Swallow parsing errors if we require a pages config file.
		// At this point, we can't tell if the user intended to provide a Pages config file (and so should see the parsing error) or not (and so shouldn't).
		// We err on the side of swallowing the error so as to not break existing projects
		if (requirePagesConfig) {
			logger.error(e);
			throw new FatalError(
				`Your ${configFileName(configPath)} file is not a valid Pages config file`,
				EXIT_CODE_INVALID_PAGES_CONFIG
			);
		} else {
			throw e;
		}
	}

	/**
	 * Check if configuration file belongs to a Pages project.
	 *
	 * The `pages_build_output_dir` config key is used to determine if the
	 * configuration file belongs to a Workers or Pages project. This key
	 * should always be set for Pages but never for Workers.
	 */
	const isPagesConfigFile = isPagesConfig(rawConfig);
	if (!isPagesConfigFile && requirePagesConfig) {
		throw new FatalError(
			`Your ${configFileName(configPath)} file is not a valid Pages config file`,
			EXIT_CODE_INVALID_PAGES_CONFIG
		);
	}

	// Process the top-level configuration. This is common for both
	// Workers and Pages
	const { config, diagnostics } = normalizeAndValidateConfig(
		rawConfig,
		configPath,
		args
	);

	if (diagnostics.hasWarnings() && !hideWarnings) {
		logger.warn(diagnostics.renderWarnings());
	}
	if (diagnostics.hasErrors()) {
		throw new UserError(diagnostics.renderErrors());
	}

	// If we detected a Pages project, run config file validation against
	// Pages specific validation rules
	if (isPagesConfigFile) {
		logger.debug(
			`Configuration file belonging to ⚡️ Pages ⚡️ project detected.`
		);

		const envNames = rawConfig.env ? Object.keys(rawConfig.env) : [];
		const projectName = rawConfig?.name;
		const pagesDiagnostics = validatePagesConfig(config, envNames, projectName);

		if (pagesDiagnostics.hasWarnings()) {
			logger.warn(pagesDiagnostics.renderWarnings());
		}
		if (pagesDiagnostics.hasErrors()) {
			throw new UserError(pagesDiagnostics.renderErrors());
		}
	}

	applyPythonConfig(config, args);

	return config;
}

/**
 * Modifies the provided config to support python workers, if the entrypoint is a .py file
 */
function applyPythonConfig(config: Config, args: ReadConfigCommandArgs) {
	const mainModule = "script" in args ? args.script : config.main;
	if (typeof mainModule === "string" && mainModule.endsWith(".py")) {
		// Workers with a python entrypoint should have bundling turned off, since all of Wrangler's bundling is JS/TS specific
		config.no_bundle = true;

		// Workers with a python entrypoint need module rules for "*.py". Add one automatically as a DX nicety
		if (!config.rules.some((rule) => rule.type === "PythonModule")) {
			config.rules.push({ type: "PythonModule", globs: ["**/*.py"] });
		}
		if (!config.compatibility_flags.includes("python_workers")) {
			throw new UserError(
				"The `python_workers` compatibility flag is required to use Python."
			);
		}
	}
}

/**
 * Find the wrangler config file by searching up the file-system
 * from the current working directory.
 */
export function findWranglerConfig(
	referencePath: string = process.cwd()
): string | undefined {
	return (
		findUpSync(`wrangler.json`, { cwd: referencePath }) ??
		findUpSync(`wrangler.jsonc`, { cwd: referencePath }) ??
		findUpSync(`wrangler.toml`, { cwd: referencePath })
	);
}

function addLocalSuffix(id: string, local: boolean = false) {
	return `${id}${local ? " (local)" : ""}`;
}

export const friendlyBindingNames: Record<
	keyof CfWorkerInit["bindings"],
	string
> = {
	data_blobs: "Data Blobs",
	durable_objects: "Durable Objects",
	kv_namespaces: "KV Namespaces",
	send_email: "Send Email",
	queues: "Queues",
	d1_databases: "D1 Databases",
	vectorize: "Vectorize Indexes",
	hyperdrive: "Hyperdrive Configs",
	r2_buckets: "R2 Buckets",
	logfwdr: "logfwdr",
	services: "Services",
	analytics_engine_datasets: "Analytics Engine Datasets",
	text_blobs: "Text Blobs",
	browser: "Browser",
	ai: "AI",
	version_metadata: "Worker Version Metadata",
	unsafe: "Unsafe Metadata",
	vars: "Vars",
	wasm_modules: "Wasm Modules",
	dispatch_namespaces: "Dispatch Namespaces",
	mtls_certificates: "mTLS Certificates",
	workflows: "Workflows",
	pipelines: "Pipelines",
	assets: "Assets",
} as const;

/**
 * Print all the bindings a worker using a given config would have access to
 */
export function printBindings(
	bindings: CfWorkerInit["bindings"],
	context: {
		registry?: WorkerRegistry;
		local?: boolean;
	} = {}
) {
	let hasConnectionStatus = false;
	const truncate = (item: string | Record<string, unknown>) => {
		const s = typeof item === "string" ? item : JSON.stringify(item);
		const maxLength = 40;
		if (s.length < maxLength) {
			return s;
		}

		return `${s.substring(0, maxLength - 3)}...`;
	};

	const output: {
		name: string;
		entries: { key: string; value: string | boolean }[];
	}[] = [];

	const {
		data_blobs,
		durable_objects,
		workflows,
		kv_namespaces,
		send_email,
		queues,
		d1_databases,
		vectorize,
		hyperdrive,
		r2_buckets,
		logfwdr,
		services,
		analytics_engine_datasets,
		text_blobs,
		browser,
		ai,
		version_metadata,
		unsafe,
		vars,
		wasm_modules,
		dispatch_namespaces,
		mtls_certificates,
		pipelines,
	} = bindings;

	if (data_blobs !== undefined && Object.keys(data_blobs).length > 0) {
		output.push({
			name: friendlyBindingNames.data_blobs,
			entries: Object.entries(data_blobs).map(([key, value]) => ({
				key,
				value: typeof value === "string" ? truncate(value) : "<Buffer>",
			})),
		});
	}

	if (durable_objects !== undefined && durable_objects.bindings.length > 0) {
		output.push({
			name: friendlyBindingNames.durable_objects,
			entries: durable_objects.bindings.map(
				({ name, class_name, script_name }) => {
					let value = class_name;
					if (script_name) {
						if (context.local) {
							const registryDefinition = context.registry?.[script_name];

							hasConnectionStatus = true;
							if (
								registryDefinition &&
								registryDefinition.durableObjects.some(
									(d) => d.className === class_name
								)
							) {
								value += ` (defined in ${script_name} ${chalk.green("[connected]")})`;
							} else {
								value += ` (defined in ${script_name} ${chalk.red("[not connected]")})`;
							}
						} else {
							value += ` (defined in ${script_name})`;
						}
					}

					return {
						key: name,
						value,
					};
				}
			),
		});
	}

	if (workflows !== undefined && workflows.length > 0) {
		output.push({
			name: friendlyBindingNames.workflows,
			entries: workflows.map(({ class_name, script_name, binding }) => {
				let value = class_name;
				if (script_name) {
					value += ` (defined in ${script_name})`;
				}

				return {
					key: binding,
					value,
				};
			}),
		});
	}

	if (kv_namespaces !== undefined && kv_namespaces.length > 0) {
		output.push({
			name: friendlyBindingNames.kv_namespaces,
			entries: kv_namespaces.map(({ binding, id }) => {
				return {
					key: binding,
					value: addLocalSuffix(id, context.local),
				};
			}),
		});
	}

	if (send_email !== undefined && send_email.length > 0) {
		output.push({
			name: friendlyBindingNames.send_email,
			entries: send_email.map(
				({ name, destination_address, allowed_destination_addresses }) => {
					return {
						key: name,
						value:
							destination_address ||
							allowed_destination_addresses?.join(", ") ||
							"unrestricted",
					};
				}
			),
		});
	}

	if (queues !== undefined && queues.length > 0) {
		output.push({
			name: friendlyBindingNames.queues,
			entries: queues.map(({ binding, queue_name }) => {
				return {
					key: binding,
					value: addLocalSuffix(queue_name, context.local),
				};
			}),
		});
	}

	if (d1_databases !== undefined && d1_databases.length > 0) {
		output.push({
			name: friendlyBindingNames.d1_databases,
			entries: d1_databases.map(
				({ binding, database_name, database_id, preview_database_id }) => {
					let databaseValue = `${database_id}`;
					if (database_name) {
						databaseValue = `${database_name} (${database_id})`;
					}
					//database_id is local when running `wrangler dev --local`
					if (preview_database_id && database_id !== "local") {
						databaseValue += `, Preview: (${preview_database_id})`;
					}
					return {
						key: binding,
						value: addLocalSuffix(databaseValue, context.local),
					};
				}
			),
		});
	}

	if (vectorize !== undefined && vectorize.length > 0) {
		output.push({
			name: friendlyBindingNames.vectorize,
			entries: vectorize.map(({ binding, index_name }) => {
				return {
					key: binding,
					value: addLocalSuffix(index_name, context.local),
				};
			}),
		});
	}

	if (hyperdrive !== undefined && hyperdrive.length > 0) {
		output.push({
			name: friendlyBindingNames.hyperdrive,
			entries: hyperdrive.map(({ binding, id }) => {
				return {
					key: binding,
					value: addLocalSuffix(id, context.local),
				};
			}),
		});
	}

	if (r2_buckets !== undefined && r2_buckets.length > 0) {
		output.push({
			name: friendlyBindingNames.r2_buckets,
			entries: r2_buckets.map(({ binding, bucket_name, jurisdiction }) => {
				if (jurisdiction !== undefined) {
					bucket_name += ` (${jurisdiction})`;
				}
				return {
					key: binding,
					value: addLocalSuffix(bucket_name, context.local),
				};
			}),
		});
	}

	if (logfwdr !== undefined && logfwdr.bindings.length > 0) {
		output.push({
			name: friendlyBindingNames.logfwdr,
			entries: logfwdr.bindings.map((binding) => {
				return {
					key: binding.name,
					value: binding.destination,
				};
			}),
		});
	}

	if (services !== undefined && services.length > 0) {
		output.push({
			name: friendlyBindingNames.services,
			entries: services.map(({ binding, service, entrypoint }) => {
				let value = service;
				if (entrypoint) {
					value += `#${entrypoint}`;
				}

				if (context.local) {
					const registryDefinition = context.registry?.[service];
					hasConnectionStatus = true;

					if (
						registryDefinition &&
						(!entrypoint ||
							registryDefinition.entrypointAddresses?.[entrypoint])
					) {
						value = value + " " + chalk.green("[connected]");
					} else {
						value = value + " " + chalk.red("[not connected]");
					}
				}
				return {
					key: binding,
					value,
				};
			}),
		});
	}

	if (
		analytics_engine_datasets !== undefined &&
		analytics_engine_datasets.length > 0
	) {
		output.push({
			name: friendlyBindingNames.analytics_engine_datasets,
			entries: analytics_engine_datasets.map(({ binding, dataset }) => {
				return {
					key: binding,
					value: dataset ?? binding,
				};
			}),
		});
	}

	if (text_blobs !== undefined && Object.keys(text_blobs).length > 0) {
		output.push({
			name: friendlyBindingNames.text_blobs,
			entries: Object.entries(text_blobs).map(([key, value]) => ({
				key,
				value: truncate(value),
			})),
		});
	}

	if (browser !== undefined) {
		output.push({
			name: friendlyBindingNames.browser,
			entries: [{ key: "Name", value: browser.binding }],
		});
	}

	if (ai !== undefined) {
		const entries: [{ key: string; value: string | boolean }] = [
			{ key: "Name", value: ai.binding },
		];
		if (ai.staging) {
			entries.push({ key: "Staging", value: ai.staging });
		}

		output.push({
			name: friendlyBindingNames.ai,
			entries: entries,
		});
	}

	if (pipelines?.length) {
		output.push({
			name: friendlyBindingNames.pipelines,
			entries: pipelines.map(({ binding, pipeline }) => ({
				key: binding,
				value: pipeline,
			})),
		});
	}

	if (version_metadata !== undefined) {
		output.push({
			name: friendlyBindingNames.version_metadata,
			entries: [{ key: "Name", value: version_metadata.binding }],
		});
	}

	if (unsafe?.bindings !== undefined && unsafe.bindings.length > 0) {
		output.push({
			name: friendlyBindingNames.unsafe,
			entries: unsafe.bindings.map(({ name, type }) => ({
				key: type,
				value: name,
			})),
		});
	}

	if (vars !== undefined && Object.keys(vars).length > 0) {
		output.push({
			name: friendlyBindingNames.vars,
			entries: Object.entries(vars).map(([key, value]) => {
				let parsedValue;
				if (typeof value === "string") {
					parsedValue = `"${truncate(value)}"`;
				} else if (typeof value === "object") {
					parsedValue = JSON.stringify(value, null, 1);
				} else {
					parsedValue = `${truncate(`${value}`)}`;
				}
				return {
					key,
					value: parsedValue,
				};
			}),
		});
	}

	if (wasm_modules !== undefined && Object.keys(wasm_modules).length > 0) {
		output.push({
			name: friendlyBindingNames.wasm_modules,
			entries: Object.entries(wasm_modules).map(([key, value]) => ({
				key,
				value: typeof value === "string" ? truncate(value) : "<Wasm>",
			})),
		});
	}

	if (dispatch_namespaces !== undefined && dispatch_namespaces.length > 0) {
		output.push({
			name: friendlyBindingNames.dispatch_namespaces,
			entries: dispatch_namespaces.map(({ binding, namespace, outbound }) => {
				return {
					key: binding,
					value: outbound
						? `${namespace} (outbound -> ${outbound.service})`
						: namespace,
				};
			}),
		});
	}

	if (mtls_certificates !== undefined && mtls_certificates.length > 0) {
		output.push({
			name: friendlyBindingNames.mtls_certificates,
			entries: mtls_certificates.map(({ binding, certificate_id }) => {
				return {
					key: binding,
					value: certificate_id,
				};
			}),
		});
	}

	if (unsafe?.metadata !== undefined) {
		output.push({
			name: friendlyBindingNames.unsafe,
			entries: Object.entries(unsafe.metadata).map(([key, value]) => ({
				key,
				value: JSON.stringify(value),
			})),
		});
	}

	if (output.length === 0) {
		return;
	}

	const message = [
		`Your worker has access to the following bindings:`,
		...output
			.map((bindingGroup) => {
				return [
					`- ${bindingGroup.name}:`,
					bindingGroup.entries.map(({ key, value }) => `  - ${key}: ${value}`),
				];
			})
			.flat(2),
	].join("\n");

	logger.log(message);

	if (hasConnectionStatus) {
		logger.once.info(
			`\nService bindings & durable object bindings connect to other \`wrangler dev\` processes running locally, with their connection status indicated by ${chalk.green("[connected]")} or ${chalk.red("[not connected]")}. For more details, refer to https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/#local-development\n`
		);
	}
}

export function withConfig<T>(
	handler: (
		t: OnlyCamelCase<T & CommonYargsOptions> & { config: Config }
	) => Promise<void>
) {
	return (t: OnlyCamelCase<T & CommonYargsOptions>) => {
		return handler({ ...t, config: readConfig(t.config, t) });
	};
}

export interface DotEnv {
	path: string;
	parsed: dotenv.DotenvParseOutput;
}

function tryLoadDotEnv(path: string): DotEnv | undefined {
	try {
		const parsed = dotenv.parse(fs.readFileSync(path));
		return { path, parsed };
	} catch (e) {
		if((e as { code: string }).code === "ENOENT") {
			logger.debug(`.env file not found at "${path}"`);
		} else {
			logger.debug(`Failed to load .env file "${path}":`, e);
		}
	}
}

/**
 * Loads a dotenv file from <path>, preferring to read <path>.<environment> if
 * <environment> is defined and that file exists.
 */
export function loadDotEnv(path: string, env?: string): DotEnv | undefined {
	if (env === undefined) {
		return tryLoadDotEnv(path);
	} else {
		return tryLoadDotEnv(`${path}.${env}`) ?? tryLoadDotEnv(path);
	}
}
