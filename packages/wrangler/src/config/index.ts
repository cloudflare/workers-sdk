import fs from "node:fs";
import dotenv from "dotenv";
import { findUpSync } from "find-up";
import { FatalError, UserError } from "../errors";
import { logger } from "../logger";
import { EXIT_CODE_INVALID_PAGES_CONFIG } from "../pages/errors";
import { parseJSONC, parseTOML, readFileSync } from "../parse";
import { isPagesConfig, normalizeAndValidateConfig } from "./validation";
import { validatePagesConfig } from "./validation-pages";
import type { CfWorkerInit } from "../deployment-bundle/worker";
import type { CommonYargsOptions } from "../yargs-types";
import type { Config, OnlyCamelCase, RawConfig } from "./config";

export type {
	Config,
	RawConfig,
	ConfigFields,
	DevConfig,
	RawDevConfig,
} from "./config";
export type {
	Environment,
	RawEnvironment,
	ConfigModuleRuleType,
} from "./environment";

type ReadConfigCommandArgs<CommandArgs> = CommandArgs &
	Pick<OnlyCamelCase<CommonYargsOptions>, "experimentalJsonConfig"> &
	Partial<Pick<OnlyCamelCase<CommonYargsOptions>, "env">>;

/**
 * Get the Wrangler configuration; read it from the give `configPath` if available.
 */
export function readConfig<CommandArgs>(
	configPath: string | undefined,
	// Include command specific args as well as the wrangler global flags
	args: ReadConfigCommandArgs<CommandArgs>,
	requirePagesConfig: true
): Omit<Config, "pages_build_output_dir"> & { pages_build_output_dir: string };
export function readConfig<CommandArgs>(
	configPath: string | undefined,
	// Include command specific args as well as the wrangler global flags
	args: ReadConfigCommandArgs<CommandArgs>,
	requirePagesConfig?: boolean,
	hideWarnings?: boolean
): Config;
export function readConfig<CommandArgs>(
	configPath: string | undefined,
	// Include command specific args as well as the wrangler global flags
	args: ReadConfigCommandArgs<CommandArgs>,
	requirePagesConfig?: boolean,
	hideWarnings: boolean = false
): Config {
	let rawConfig: RawConfig = {};

	if (!configPath) {
		configPath = findWranglerToml(process.cwd(), args.experimentalJsonConfig);
	}

	try {
		// Load the configuration from disk if available
		if (configPath?.endsWith("toml")) {
			rawConfig = parseTOML(readFileSync(configPath), configPath);
		} else if (configPath?.endsWith("json")) {
			rawConfig = parseJSONC(readFileSync(configPath), configPath);
		}
	} catch (e) {
		// Swallow parsing errors if we require a pages config file.
		// At this point, we can't tell if the user intended to provide a Pages config file (and so should see the parsing error) or not (and so shouldn't).
		// We err on the side of swallowing the error so as to not break existing projects
		if (requirePagesConfig) {
			logger.error(e);
			throw new FatalError(
				"Your wrangler.toml is not a valid Pages config file",
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
	 * should always be set for Pages but never for Workers. Furthermore,
	 * Pages projects currently have support for `wrangler.toml` only,
	 * so we should error if `wrangler.json` is detected in a Pages project
	 */
	const isPagesConfigFile = isPagesConfig(rawConfig);
	if (!isPagesConfigFile && requirePagesConfig) {
		throw new FatalError(
			"Your wrangler.toml is not a valid Pages config file",
			EXIT_CODE_INVALID_PAGES_CONFIG
		);
	}
	if (
		isPagesConfigFile &&
		(configPath?.endsWith("json") || args.experimentalJsonConfig)
	) {
		throw new UserError(
			`Pages doesn't currently support JSON formatted config \`${
				configPath ?? "wrangler.json"
			}\`. Please use wrangler.toml instead.`
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

	const mainModule = "script" in args ? args.script : config.main;
	if (typeof mainModule === "string" && mainModule.endsWith(".py")) {
		// Workers with a python entrypoint should have bundling turned off, since all of Wrangler's bundling is JS/TS specific
		config.no_bundle = true;

		// Workers with a python entrypoint need module rules for "*.py". Add one automatically as a DX nicety
		if (!config.rules.some((rule) => rule.type === "PythonModule")) {
			config.rules.push({ type: "PythonModule", globs: ["**/*.py"] });
		}
	}

	return config;
}

/**
 * Find the wrangler.toml file by searching up the file-system
 * from the current working directory.
 */
export function findWranglerToml(
	referencePath: string = process.cwd(),
	preferJson = false
): string | undefined {
	if (preferJson) {
		return (
			findUpSync(`wrangler.json`, { cwd: referencePath }) ??
			findUpSync(`wrangler.toml`, { cwd: referencePath })
		);
	}
	return findUpSync(`wrangler.toml`, { cwd: referencePath });
}

/**
 * Print all the bindings a worker using a given config would have access to
 */
export function printBindings(bindings: CfWorkerInit["bindings"]) {
	const truncate = (item: string | Record<string, unknown>) => {
		const s = typeof item === "string" ? item : JSON.stringify(item);
		const maxLength = 40;
		if (s.length < maxLength) {
			return s;
		}

		return `${s.substring(0, maxLength - 3)}...`;
	};

	const output: {
		type: string;
		entries: { key: string; value: string | boolean }[];
	}[] = [];

	const {
		data_blobs,
		durable_objects,
		kv_namespaces,
		send_email,
		queues,
		d1_databases,
		vectorize,
		constellation,
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
	} = bindings;

	if (data_blobs !== undefined && Object.keys(data_blobs).length > 0) {
		output.push({
			type: "Data Blobs",
			entries: Object.entries(data_blobs).map(([key, value]) => ({
				key,
				value: typeof value === "string" ? truncate(value) : "<Buffer>",
			})),
		});
	}

	if (durable_objects !== undefined && durable_objects.bindings.length > 0) {
		output.push({
			type: "Durable Objects",
			entries: durable_objects.bindings.map(
				({ name, class_name, script_name, environment }) => {
					let value = class_name;
					if (script_name) {
						value += ` (defined in ${script_name})`;
					}
					if (environment) {
						value += ` - ${environment}`;
					}

					return {
						key: name,
						value,
					};
				}
			),
		});
	}

	if (kv_namespaces !== undefined && kv_namespaces.length > 0) {
		output.push({
			type: "KV Namespaces",
			entries: kv_namespaces.map(({ binding, id }) => {
				return {
					key: binding,
					value: id,
				};
			}),
		});
	}

	if (send_email !== undefined && send_email.length > 0) {
		output.push({
			type: "Send Email",
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
			type: "Queues",
			entries: queues.map(({ binding, queue_name }) => {
				return {
					key: binding,
					value: queue_name,
				};
			}),
		});
	}

	if (d1_databases !== undefined && d1_databases.length > 0) {
		output.push({
			type: "D1 Databases",
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
						value: databaseValue,
					};
				}
			),
		});
	}

	if (vectorize !== undefined && vectorize.length > 0) {
		output.push({
			type: "Vectorize Indexes",
			entries: vectorize.map(({ binding, index_name }) => {
				return {
					key: binding,
					value: index_name,
				};
			}),
		});
	}

	if (constellation !== undefined && constellation.length > 0) {
		output.push({
			type: "Constellation Projects",
			entries: constellation.map(({ binding, project_id }) => {
				return {
					key: binding,
					value: project_id,
				};
			}),
		});
	}

	if (hyperdrive !== undefined && hyperdrive.length > 0) {
		output.push({
			type: "Hyperdrive Configs",
			entries: hyperdrive.map(({ binding, id }) => {
				return {
					key: binding,
					value: id,
				};
			}),
		});
	}

	if (r2_buckets !== undefined && r2_buckets.length > 0) {
		output.push({
			type: "R2 Buckets",
			entries: r2_buckets.map(({ binding, bucket_name, jurisdiction }) => {
				if (jurisdiction !== undefined) {
					bucket_name += ` (${jurisdiction})`;
				}
				return {
					key: binding,
					value: bucket_name,
				};
			}),
		});
	}

	if (logfwdr !== undefined && logfwdr.bindings.length > 0) {
		output.push({
			type: "logfwdr",
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
			type: "Services",
			entries: services.map(({ binding, service, environment, entrypoint }) => {
				let value = service;
				if (environment) {
					value += ` - ${environment}${entrypoint ? ` (#${entrypoint})` : ""}`;
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
			type: "Analytics Engine Datasets",
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
			type: "Text Blobs",
			entries: Object.entries(text_blobs).map(([key, value]) => ({
				key,
				value: truncate(value),
			})),
		});
	}

	if (browser !== undefined) {
		output.push({
			type: "Browser",
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
			type: "AI",
			entries: entries,
		});
	}

	if (version_metadata !== undefined) {
		output.push({
			type: "Worker Version Metadata",
			entries: [{ key: "Name", value: version_metadata.binding }],
		});
	}

	if (unsafe?.bindings !== undefined && unsafe.bindings.length > 0) {
		output.push({
			type: "Unsafe",
			entries: unsafe.bindings.map(({ name, type }) => ({
				key: type,
				value: name,
			})),
		});
	}

	if (vars !== undefined && Object.keys(vars).length > 0) {
		output.push({
			type: "Vars",
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
			type: "Wasm Modules",
			entries: Object.entries(wasm_modules).map(([key, value]) => ({
				key,
				value: typeof value === "string" ? truncate(value) : "<Wasm>",
			})),
		});
	}

	if (dispatch_namespaces !== undefined && dispatch_namespaces.length > 0) {
		output.push({
			type: "dispatch namespaces",
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
			type: "mTLS Certificates",
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
			type: "Unsafe Metadata",
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
					`- ${bindingGroup.type}:`,
					bindingGroup.entries.map(({ key, value }) => `  - ${key}: ${value}`),
				];
			})
			.flat(2),
	].join("\n");

	logger.log(message);
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
		logger.debug(`Failed to load .env file "${path}":`, e);
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
