import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import {
	CommandLineArgsError,
	configFileName,
	experimental_readRawConfig,
	FatalError,
	parseJSONC,
	UserError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import * as find from "empathic/find";
import { getNodeCompat } from "miniflare";
import { readConfig } from "../config";
import { createCommand } from "../core/create-command";
import { getEntry } from "../deployment-bundle/entry";
import { getDurableObjectClassNameToUseSQLiteMap } from "../dev/class-names-sqlite";
import { getVarsForDev } from "../dev/dev-vars";
import { logger } from "../logger";
import { isProcessEnvPopulated } from "../process-env";
import {
	checkTypesUpToDate,
	DEFAULT_WORKERS_TYPES_FILE_NAME,
	getEnvHeader,
	throwMissingBindingError,
	toEnvInterfaceName,
	TOP_LEVEL_ENV_NAME,
	validateEnvInterfaceNames,
} from "./helpers";
import { fetchPipelineTypes } from "./pipeline-schema";
import { generateRuntimeTypes } from "./runtime";
import { logRuntimeTypesMessage } from "./runtime/log-runtime-types-message";
import type { Entry } from "../deployment-bundle/entry";
import type {
	Config,
	RawConfig,
	RawEnvironment,
} from "@cloudflare/workers-utils";

export interface GenerateTypesOptions {
	/**
	 * Path to the Wrangler config file to use. Can be an array for multi-config type resolution.
	 */
	config?: string | string[];

	/**
	 * Name of the Wrangler environment to generate types for.
	 */
	env?: string;

	/**
	 * Paths to `.env` files to load when inferring local variables and secrets.
	 */
	envFile?: string[];

	/**
	 * Name of the generated environment interface.
	 */
	envInterface?: string;

	/**
	 * Whether to include environment/bindings types in the output.
	 */
	includeEnv?: boolean;

	/**
	 * Whether to include runtime types in the output.
	 */
	includeRuntime?: boolean;

	/**
	 * Path to the declaration file for generated types.
	 */
	path?: string;

	/**
	 * Whether to generate strict literal/union variable types.
	 */
	strictVars?: boolean;
}

interface ResolvedGenerateTypesOptions {
	config: Config;
	envHeaderCommand?: string;
	env?: string;
	envFile?: string[];
	envInterface: string;
	includeEnv: boolean;
	includeRuntime: boolean;
	path: string;
	secondaryEntries: Map<string, Entry>;
	strictVars: boolean;
}

interface GeneratedTypesResult {
	config: Config;
	content: string;
	env: string | null;
	path: string;
	runtime: string | null;
	shouldWriteFile: boolean;
}

export const typesCommand = createCommand({
	metadata: {
		description: "📝 Generate types from your Worker configuration\n",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		epilogue:
			"📖 Learn more at https://developers.cloudflare.com/workers/languages/typescript/#generate-types",
		category: "Compute & AI",
	},
	behaviour: {
		provideConfig: false,
	},
	positionalArgs: ["path"],
	args: {
		path: {
			describe: "The path to the declaration file for the generated types",
			type: "string",
			default: DEFAULT_WORKERS_TYPES_FILE_NAME,
			demandOption: false,
		},
		"env-interface": {
			type: "string",
			default: "Env",
			describe: "The name of the generated environment interface",
			requiresArg: true,
		},
		"include-runtime": {
			type: "boolean",
			default: true,
			describe: "Include runtime types in the generated types",
		},
		"include-env": {
			type: "boolean",
			default: true,
			describe: "Include Env types in the generated types",
		},
		"strict-vars": {
			type: "boolean",
			default: true,
			describe: "Generate literal and union types for variables",
		},
		"experimental-include-runtime": {
			alias: "x-include-runtime",
			type: "string",
			describe: "The path of the generated runtime types file",
			demandOption: false,
			hidden: true,
			deprecated: true,
		},
		check: {
			demandOption: false,
			describe:
				"Check if the types at the provided path are up to date without regenerating them",
			type: "boolean",
		},
	},
	validateArgs(args) {
		// args.xRuntime will be a string if the user passes "--x-include-runtime" or "--x-include-runtime=..."
		if (typeof args.experimentalIncludeRuntime === "string") {
			throw new CommandLineArgsError(
				"You no longer need to use --experimental-include-runtime.\n" +
					"`wrangler types` will now generate runtime types in the same file as the Env types.\n" +
					"You should delete the old runtime types file, and remove it from your tsconfig.json.\n" +
					"Then rerun `wrangler types`.",
				{ telemetryMessage: "type generation args include runtime deprecated" }
			);
		}

		const validInterfaceRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;

		if (!validInterfaceRegex.test(args.envInterface)) {
			throw new CommandLineArgsError(
				`The provided env-interface value ("${args.envInterface}") does not satisfy the validation regex: ${validInterfaceRegex}`,
				{
					telemetryMessage: "type generation args invalid env interface",
				}
			);
		}

		if (!args.path.endsWith(".d.ts")) {
			throw new CommandLineArgsError(
				`The provided output path '${args.path}' does not point to a declaration file - please use the '.d.ts' extension`,
				{
					telemetryMessage: "type generation args invalid output path",
				}
			);
		}

		validateTypesFile(args.path);

		if (!args.includeEnv && !args.includeRuntime) {
			throw new CommandLineArgsError(
				`You cannot run this command without including either Env or Runtime types`,
				{
					telemetryMessage: "type generation args missing type selection",
				}
			);
		}
	},
	async handler(args) {
		const resolvedOptions = await resolveGenerateTypesOptions(args, {
			logSecondaryEntries: true,
			validateOptions: false,
			validateOutputPath: false,
		});

		const {
			config,
			envInterface,
			path: outputPath,
			secondaryEntries,
		} = resolvedOptions;

		if (args.check) {
			const outOfDate = await checkTypesUpToDate(
				config,
				envInterface,
				outputPath,
				secondaryEntries
			);
			if (outOfDate) {
				throw new FatalError(
					`Types at ${outputPath} are out of date. Run \`wrangler types\` to regenerate.`,
					{
						code: 1,
						telemetryMessage: "type generation check types out of date",
					}
				);
			}

			logger.log(`✨ Types at ${outputPath} are up to date.\n`);
			return;
		}

		const generatedTypes = await generateTypesFromResolvedOptions(
			resolvedOptions,
			true
		);

		logHorizontalRule();

		if (generatedTypes.shouldWriteFile) {
			fs.writeFileSync(outputPath, generatedTypes.content, "utf-8");
			logger.log(`✨ Types written to ${outputPath}\n`);
		}
		const configPath = config.configPath as string;
		const tsconfigPath =
			config.tsconfig ?? join(dirname(configPath), "tsconfig.json");
		const tsconfigTypes = readTsconfigTypes(tsconfigPath);
		const { mode } = getNodeCompat(
			config.compatibility_date,
			config.compatibility_flags
		);
		if (resolvedOptions.includeRuntime) {
			logRuntimeTypesMessage(tsconfigTypes, mode !== null);
		}
		logger.log(
			`📣 Remember to rerun 'wrangler types' after you change your ${configFileName(configPath)} file.\n`
		);
	},
});

/**
 * Generates Wrangler types programmatically from an options object.
 *
 * This API mirrors the `wrangler types` command flags, but returns the generated
 * declaration content as structured strings instead of writing to disk.
 *
 * @param options - Programmatic options equivalent to `wrangler types` flags.
 *
 * @returns Generated env/runtime sections, combined content, and metadata.
 */
export async function generateTypesFromWranglerOptions(
	options: GenerateTypesOptions
): Promise<GeneratedTypesResult> {
	const resolvedOptions = await resolveGenerateTypesOptions(options, {
		logSecondaryEntries: false,
		validateOptions: true,
		validateOutputPath: false,
	});
	resolvedOptions.envHeaderCommand = buildGenerateTypesHeaderCommand(
		options,
		resolvedOptions
	);

	return generateTypesFromResolvedOptions(resolvedOptions, false);
}

function buildGenerateTypesHeaderCommand(
	options: GenerateTypesOptions,
	resolvedOptions: ResolvedGenerateTypesOptions
): string {
	const commandParts: string[] = ["wrangler", "types"];

	if (options.env !== undefined) {
		commandParts.push(`--env=${options.env}`);
	}

	for (const envFile of options.envFile ?? []) {
		commandParts.push(`--env-file=${envFile}`);
	}

	if (options.includeRuntime === false) {
		commandParts.push("--include-runtime=false");
	}

	if (options.includeEnv === false) {
		commandParts.push("--include-env=false");
	}

	if (options.strictVars === false) {
		commandParts.push("--strict-vars=false");
	}

	if (options.envInterface !== undefined && options.envInterface !== "Env") {
		commandParts.push(`--env-interface=${options.envInterface}`);
	}

	if (resolvedOptions.path !== DEFAULT_WORKERS_TYPES_FILE_NAME) {
		commandParts.push(resolvedOptions.path);
	}

	return commandParts.join(" ");
}

/**
 * Resolves user-provided generation options into a fully-populated shape.
 *
 * This function applies defaults, validates option combinations, reads the
 * primary config, and resolves secondary worker entries used for cross-worker
 * service and Durable Object type references.
 *
 * @param options - Raw generation options from CLI/API call sites.
 * @param controls - Internal behavior toggles for validation and logging.
 *
 * @returns Fully-resolved options ready for type generation.
 */
async function resolveGenerateTypesOptions(
	options: GenerateTypesOptions,
	{
		logSecondaryEntries,
		validateOptions,
		validateOutputPath,
	}: {
		logSecondaryEntries: boolean;
		validateOptions: boolean;
		validateOutputPath: boolean;
	}
): Promise<ResolvedGenerateTypesOptions> {
	const envInterface = options.envInterface ?? "Env";
	const includeEnv = options.includeEnv ?? true;
	const includeRuntime = options.includeRuntime ?? true;
	const path = options.path ?? DEFAULT_WORKERS_TYPES_FILE_NAME;
	const strictVars = options.strictVars ?? true;

	if (validateOptions) {
		validateGenerateTypesOptions({
			envInterface,
			includeEnv,
			includeRuntime,
			path,
			validateOutputPath,
		});
	}

	let config: Config;
	const secondaryConfigs: Config[] = [];
	if (Array.isArray(options.config)) {
		config = readConfig({ config: options.config[0], env: options.env });
		for (const configPath of options.config.slice(1)) {
			secondaryConfigs.push(readConfig({ config: configPath }));
		}
	} else {
		config = readConfig({ config: options.config, env: options.env });
	}

	assertConfigFileDetected(config, options.config);

	const secondaryEntries = await resolveSecondaryEntries(
		secondaryConfigs,
		logSecondaryEntries
	);

	return {
		config,
		env: options.env,
		envFile: options.envFile,
		envInterface,
		includeEnv,
		includeRuntime,
		path,
		secondaryEntries,
		strictVars,
	};
}

/**
 * Generates environment & runtime type sections using pre-resolved options.
 *
 * Unlike the CLI command handler, this function does not write to disk; instead
 * it returns the generated pieces and whether the CLI should write a file for
 * this result.
 *
 * @param options - Fully-resolved generation options.
 * @param log - Whether generation progress should be logged.
 *
 * @returns Combined and split generated type sections plus write metadata.
 */
async function generateTypesFromResolvedOptions(
	options: ResolvedGenerateTypesOptions,
	log: boolean
): Promise<GeneratedTypesResult> {
	const entrypoint = await getTypesEntrypoint(options.config);
	const entrypointFormat = entrypoint?.format ?? "modules";

	const header: string[] = ["/* eslint-disable */"];
	const content: string[] = [];

	let env: string | null = null;
	if (options.includeEnv) {
		if (log) {
			logger.log(`Generating project types...\n`);
		}

		const { envHeader, envTypes } = await generateEnvTypes(
			options.config,
			{
				env: options.env,
				envFile: options.envFile,
				strictVars: options.strictVars,
			},
			options.envInterface,
			options.path,
			entrypoint,
			options.secondaryEntries,
			options.envHeaderCommand,
			log
		);
		if (envHeader && envTypes) {
			env = envTypes;
			header.push(envHeader);
			content.push(envTypes);
		}
	}

	let runtime: string | null = null;
	if (options.includeRuntime) {
		if (log) {
			logger.log("Generating runtime types...\n");
		}

		const { runtimeHeader, runtimeTypes } = await generateRuntimeTypes({
			config: options.config,
			outFile: options.path || undefined,
		});
		runtime = runtimeTypes;
		header.push(runtimeHeader);
		content.push(`// Begin runtime types\n${runtimeTypes}`);
		if (log) {
			logger.log(chalk.dim("Runtime types generated.\n"));
		}
	}

	const shouldWriteFile =
		(header.length > 1 && content.length > 0) || entrypointFormat === "modules";

	return {
		config: options.config,
		content: shouldWriteFile
			? `${header.join("\n")}\n${content.join("\n")}`
			: "",
		env,
		path: options.path,
		runtime,
		shouldWriteFile,
	};
}

/**
 * Resolves additional worker configs into a name-to-entrypoint map.
 *
 * The resulting map includes both base worker names and environment-specific
 * worker names so cross-worker references in bindings can be typed correctly.
 *
 * @param secondaryConfigs - Non-primary configs passed for cross-worker typing.
 * @param logSecondaryEntries - Whether discovered workers should be logged.
 *
 * @returns Mapping from worker name to resolved entrypoint metadata.
 */
async function resolveSecondaryEntries(
	secondaryConfigs: Config[],
	logSecondaryEntries: boolean
): Promise<Map<string, Entry>> {
	const secondaryEntries = new Map<string, Entry>();

	for (const secondaryConfig of secondaryConfigs) {
		const serviceEntry = await getEntry({}, secondaryConfig, "types");
		if (!serviceEntry.name) {
			throw new UserError(
				`Could not resolve entry point for service config '${secondaryConfig}'.`,
				{
					telemetryMessage:
						"type generation command service entrypoint missing",
				}
			);
		}

		const key = serviceEntry.name;
		if (secondaryEntries.has(key)) {
			logger.warn(
				`Configuration file for Worker '${key}' has been passed in more than once using \`--config\`. To remove this warning, only pass each unique Worker config file once.`
			);
		}
		secondaryEntries.set(key, serviceEntry);
		if (logSecondaryEntries) {
			logger.log(
				chalk.dim(
					`- Found Worker '${key}' at '${relative(process.cwd(), serviceEntry.file)}' (${secondaryConfig.configPath})`
				)
			);
		}

		const { rawConfig } = experimental_readRawConfig({
			config: secondaryConfig.configPath,
		});
		for (const envName of Object.keys(rawConfig.env ?? {})) {
			const envConfig = readConfig({
				config: secondaryConfig.configPath,
				env: envName,
			});
			const envKey = envConfig.name;
			if (envKey && envKey !== key && !secondaryEntries.has(envKey)) {
				secondaryEntries.set(envKey, serviceEntry);
			}
		}
	}

	return secondaryEntries;
}

/**
 * Attempts to resolve the primary worker entrypoint for type generation.
 *
 * If the config does not declare an entrypoint, or entrypoint resolution fails,
 * this returns `undefined` so generation can continue with module defaults.
 *
 * @param config - Parsed Wrangler config for the primary worker.
 *
 * @returns Resolved entrypoint metadata when available.
 */
async function getTypesEntrypoint(config: Config): Promise<Entry | undefined> {
	const configContainsEntrypoint =
		config.main !== undefined || !!config.site?.["entry-point"];
	if (!configContainsEntrypoint) {
		return undefined;
	}

	try {
		return await getEntry({}, config, "types");
	} catch {
		return undefined;
	}
}

/**
 * Ensures that type generation is operating against a concrete config file.
 *
 * @param config - Parsed Wrangler config object.
 * @param requestedConfig - User-provided config input, used for error context.
 *
 * @throws {UserError} When no valid config file was detected.
 */
function assertConfigFileDetected(
	config: Config,
	requestedConfig: string | string[] | undefined
): void {
	if (
		config.configPath == null ||
		(fs.statSync(config.configPath, { throwIfNoEntry: false })?.isDirectory() ??
			true)
	) {
		throw new UserError(
			`No config file detected${requestedConfig ? ` (at ${requestedConfig})` : ""}. This command requires a Wrangler configuration file.`,
			{ telemetryMessage: "type generation command missing config" }
		);
	}
}

/**
 * Validates programmatic type-generation options.
 *
 * Applies the same constraints as CLI argument validation for env interface
 * naming, output file extension, and include-env/include-runtime combinations.
 *
 * @param options - Normalized options to validate.
 *
 * @throws {UserError} When any option is invalid.
 */
function validateGenerateTypesOptions({
	envInterface,
	includeEnv,
	includeRuntime,
	path,
	validateOutputPath,
}: {
	envInterface: string;
	includeEnv: boolean;
	includeRuntime: boolean;
	path: string;
	validateOutputPath: boolean;
}): void {
	const validInterfaceRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;
	if (!validInterfaceRegex.test(envInterface)) {
		throw new UserError(
			`The provided env-interface value ("${envInterface}") does not satisfy the validation regex: ${validInterfaceRegex}`,
			{ telemetryMessage: "type generation args invalid env interface" }
		);
	}

	if (!path.endsWith(".d.ts")) {
		throw new UserError(
			`The provided output path '${path}' does not point to a declaration file - please use the '.d.ts' extension`,
			{ telemetryMessage: "type generation args invalid output path" }
		);
	}

	if (validateOutputPath) {
		validateTypesFile(path);
	}

	if (!includeEnv && !includeRuntime) {
		throw new UserError(
			`You cannot run this command without including either Env or Runtime types`,
			{ telemetryMessage: "type generation args missing type selection" }
		);
	}
}

/**
 * Check if a string is a valid TypeScript identifier. This is a naive check and doesn't cover all cases
 */
export function isValidIdentifier(key: string) {
	return /^[a-zA-Z_$][\w$]*$/.test(key);
}

/**
 * Escapes special characters in a string for use in a TypeScript string literal.
 */
export function escapeTypeScriptString(str: string): string {
	return JSON.stringify(str).slice(1, -1);
}

/**
 * Construct a type key, if it's not a valid identifier, wrap it in quotes with proper escaping
 */
export function constructTypeKey(key: string) {
	if (isValidIdentifier(key)) {
		return `${key}`;
	}
	return `"${escapeTypeScriptString(key)}"`;
}

export function constructTSModuleGlob(glob: string) {
	// Exact module reference, don't transform
	if (!glob.includes("*")) {
		return glob;
		// Usually something like **/*.wasm. Turn into *.wasm
	} else if (glob.includes(".")) {
		return `*.${glob.split(".").at(-1)}`;
	} else {
		// Replace common patterns
		return glob.replace("**/*", "*").replace("**/", "*/").replace("/**", "/*");
	}
}

/**
 * Generate a import specifier from one module to another
 */
export function generateImportSpecifier(from: string, to: string) {
	// Use unix-style paths on Windows
	const relativePath = relative(dirname(from), dirname(to)).replace(/\\/g, "/");
	const filename = basename(to, extname(to));
	if (!relativePath) {
		return `./${filename}`;
	} else if (relativePath.startsWith("..")) {
		// Shallower directory
		return `${relativePath}/${filename}`;
	} else {
		// Deeper directory
		return `./${relativePath}/${filename}`;
	}
}

/**
 * Checks whether any config level (top-level or any named environment) declares
 * `secrets`. Used to determine if the project has opted into config-based
 * secret declarations, which replaces `.dev.vars`/`.env` inference for type generation.
 */
function hasConfigSecrets(rawConfig: RawConfig): boolean {
	if (rawConfig.secrets !== undefined) {
		return true;
	}
	return Object.values(rawConfig.env ?? {}).some(
		(env) => env.secrets !== undefined
	);
}

/**
 * Generates TypeScript environment type definitions from a Wrangler configuration.
 *
 * This function collects all bindings (KV, R2, D1, Durable Objects, Services, etc.),
 * variables, and secrets from the config and produces TypeScript type declarations
 * for the `Env` interface used by Cloudflare Workers.
 *
 * @param config - The parsed Wrangler configuration object
 * @param args - CLI arguments passed to the `types` command
 * @param envInterface - The name of the generated environment interface (default: "Env")
 * @param outputPath - The file path where the generated types will be written
 * @param entrypoint - Optional entry point information for the Worker
 * @param serviceEntries - Optional map of service names to their entry points for cross-worker type generation
 * @param command - Optional command string used in the generated env header.
 * @param log - Whether to log output to the console (default: true)
 *
 * @returns An object containing the generated header comment and type definitions, or undefined values if no types were generated
 */
export async function generateEnvTypes(
	config: Config,
	args: Partial<(typeof typesCommand)["args"]>,
	envInterface: string,
	outputPath: string,
	entrypoint?: Entry,
	serviceEntries?: Map<string, Entry>,
	command?: string,
	log = true
): Promise<{ envHeader?: string; envTypes?: string }> {
	const collectionArgs = {
		...args,
		config: config.configPath,
	} satisfies Partial<(typeof typesCommand)["args"]>;

	const { rawConfig } = experimental_readRawConfig(collectionArgs);

	// Determine secrets source: if any config level declares `secrets`,
	// the project is opted into config-based secrets (replaces .dev.vars inference).
	let secrets: Record<string, string> = {};
	let perEnvSecrets: Map<string, Record<string, string>> | undefined;
	const useConfigSecrets = hasConfigSecrets(rawConfig);

	if (useConfigSecrets) {
		// Config-based: build per-env secrets maps
		perEnvSecrets = new Map();

		// Top-level secrets
		const topLevelKeys: Record<string, string> = {};
		for (const key of rawConfig.secrets?.required ?? []) {
			topLevelKeys[key] = "";
		}
		perEnvSecrets.set(TOP_LEVEL_ENV_NAME, topLevelKeys);

		// Per named env secrets
		for (const [envName, envConfig] of Object.entries(rawConfig.env ?? {})) {
			const envKeys: Record<string, string> = {};
			for (const key of envConfig.secrets?.required ?? []) {
				envKeys[key] = "";
			}
			perEnvSecrets.set(envName, envKeys);
		}

		// For the simple path: use the specific env's secrets (or top-level)
		secrets = perEnvSecrets.get(args.env ?? TOP_LEVEL_ENV_NAME) ?? {};
	} else {
		// Fall back to .dev.vars/.env inference.
		// We pass an empty vars object because we only want the secret keys,
		// not merged with config vars.
		const secretBindings = getVarsForDev(
			config.userConfigPath,
			args.envFile,
			{},
			args.env,
			true
		);
		// Extract just the keys as a Record<string, string> for compatibility
		// (type generation only needs the names, not the values)
		for (const key of Object.keys(secretBindings)) {
			secrets[key] = "";
		}
	}

	const entrypointFormat = entrypoint?.format ?? "modules";

	// Note: we infer whether the user has provided an envInterface by checking
	//       if it is different from the default `Env` value, this works well
	//       besides the fact that the user itself can actually provided `Env` as
	//       an argument... we either need to do this or removing the yargs
	//       default value for envInterface and do `envInterface ?? "Env"`,
	//       for a better UX we chose to go with the yargs default value
	const userProvidedEnvInterface = envInterface !== "Env";

	if (userProvidedEnvInterface && entrypointFormat === "service-worker") {
		throw new UserError(
			"An env-interface value has been provided but the worker uses the incompatible Service Worker syntax",
			{
				telemetryMessage: "type generation command env interface incompatible",
			}
		);
	}

	const hasEnvironments =
		!!rawConfig.env && Object.keys(rawConfig.env).length > 0;

	const shouldGeneratePerEnvTypes = hasEnvironments && !args.env;
	if (shouldGeneratePerEnvTypes) {
		return generatePerEnvironmentTypes(
			config,
			collectionArgs,
			envInterface,
			outputPath,
			entrypoint,
			serviceEntries,
			secrets,
			perEnvSecrets,
			command,
			log
		);
	}

	return generateSimpleEnvTypes(
		config,
		collectionArgs,
		envInterface,
		outputPath,
		entrypoint,
		serviceEntries,
		secrets,
		command,
		log
	);
}

/**
 * Generates simple `Env` types.
 *
 * Used when no named environments exist or when `--env` is specified.
 *
 * @param config - The parsed Wrangler configuration object
 * @param collectionArgs - CLI arguments for collecting bindings
 * @param envInterface - The name of the generated environment interface
 * @param outputPath - The file path where the generated types will be written
 * @param entrypoint - Optional entry point information for the Worker
 * @param serviceEntries - Optional map of service names to their entry points for cross-worker type generation
 * @param secrets - Record of secret variable names to their values
 * @param command - Optional command string used in the generated env header.
 * @param log - Whether to log output to the console (default: true)
 *
 * @returns An object containing the generated header comment and type definitions, or undefined values if no types were generated
 */
async function generateSimpleEnvTypes(
	config: Config,
	collectionArgs: Partial<(typeof typesCommand)["args"]>,
	envInterface: string,
	outputPath: string,
	entrypoint?: Entry,
	serviceEntries?: Map<string, Entry>,
	secrets: Record<string, string> = {},
	command?: string,
	log = true
): Promise<{ envHeader?: string; envTypes?: string }> {
	const stringKeys = new Array<string>();

	const collectedBindings = collectCoreBindings(collectionArgs);
	const collectedDurableObjects = collectAllDurableObjects(collectionArgs);
	const collectedServices = collectAllServices(collectionArgs);
	const collectedUnsafeBindings = collectAllUnsafeBindings(collectionArgs);
	const collectedVars = collectAllVars(collectionArgs);
	const collectedWorkflows = collectAllWorkflows(collectionArgs);
	const collectedPipelines = collectAllPipelines(collectionArgs);

	const entrypointFormat = entrypoint?.format ?? "modules";
	const fullOutputPath = resolve(outputPath);

	const envTypeStructure = new Array<{
		key: string;
		type: string;
	}>();

	for (const binding of collectedBindings) {
		envTypeStructure.push({
			key: constructTypeKey(binding.name),
			type: binding.type,
		});
	}

	// Track named type definitions (e.g., `type MyStreamRecord = {...}`) to be added to the Cloudflare namespace
	const typeDefinitions: string[] = [];

	if (collectedPipelines.length > 0) {
		const pipelineTypes = await fetchPipelineTypes(config, collectedPipelines);
		for (const pipelineType of pipelineTypes) {
			// For service-worker format, type definitions are at the top level (not in Cloudflare namespace)
			// so we need to strip the "Cloudflare." prefix from the type reference
			const typeRef =
				entrypointFormat === "service-worker"
					? pipelineType.type.replace("Cloudflare.", "")
					: pipelineType.type;
			envTypeStructure.push({
				key: constructTypeKey(pipelineType.binding),
				type: typeRef,
			});
			if (pipelineType.typeDefinition) {
				typeDefinitions.push(pipelineType.typeDefinition);
			}
		}
	}

	if (collectedVars) {
		// Note: vars get overridden by secrets, so should their types
		const vars = Object.entries(collectedVars).filter(
			([key]) => !(key in secrets)
		);
		for (const [varName, varValues] of vars) {
			envTypeStructure.push({
				key: constructTypeKey(varName),
				type: varValues.length === 1 ? varValues[0] : varValues.join(" | "),
			});
			stringKeys.push(varName);
		}
	}

	for (const secretName in secrets) {
		envTypeStructure.push({
			key: constructTypeKey(secretName),
			type: "string",
		});
		stringKeys.push(secretName);
	}

	for (const durableObject of collectedDurableObjects) {
		const doEntrypoint = durableObject.script_name
			? serviceEntries?.get(durableObject.script_name)
			: entrypoint;

		const importPath = doEntrypoint
			? generateImportSpecifier(fullOutputPath, doEntrypoint.file)
			: undefined;

		const exportExists = doEntrypoint?.exports?.some(
			(e) => e === durableObject.class_name
		);

		const key = constructTypeKey(durableObject.name);

		if (importPath && exportExists) {
			envTypeStructure.push({
				key: key,
				type: `DurableObjectNamespace<import("${importPath}").${durableObject.class_name}>`,
			});
			continue;
		}

		if (durableObject.script_name) {
			envTypeStructure.push({
				key: key,
				type: `DurableObjectNamespace /* ${durableObject.class_name} from ${durableObject.script_name} */`,
			});
			continue;
		}

		envTypeStructure.push({
			key: key,
			type: `DurableObjectNamespace /* ${durableObject.class_name} */`,
		});
	}

	for (const service of collectedServices) {
		const serviceEntry =
			service.service !== entrypoint?.name
				? serviceEntries?.get(service.service)
				: entrypoint;

		const importPath = serviceEntry
			? generateImportSpecifier(fullOutputPath, serviceEntry.file)
			: undefined;

		const exportExists = serviceEntry?.exports?.some(
			(e) => e === (service.entrypoint ?? "default")
		);

		const key = constructTypeKey(service.binding);

		if (importPath && exportExists) {
			envTypeStructure.push({
				key: key,
				type: `Service<typeof import("${importPath}").${service.entrypoint ?? "default"}>`,
			});
			continue;
		}

		if (service.entrypoint) {
			envTypeStructure.push({
				key: key,
				type: `Service /* entrypoint ${service.entrypoint} from ${service.service} */`,
			});
			continue;
		}

		envTypeStructure.push({
			key,
			type: `Fetcher /* ${service.service} */`,
		});
	}

	for (const workflow of collectedWorkflows) {
		const workflowEntrypoint = workflow.script_name
			? serviceEntries?.get(workflow.script_name)
			: entrypoint;

		const importPath = workflowEntrypoint
			? generateImportSpecifier(fullOutputPath, workflowEntrypoint.file)
			: undefined;

		const exportExists = workflowEntrypoint?.exports?.some(
			(e) => e === workflow.class_name
		);

		const key = constructTypeKey(workflow.binding);

		if (importPath && exportExists) {
			envTypeStructure.push({
				key: key,
				type: `Workflow<Parameters<import("${importPath}").${workflow.class_name}['run']>[0]['payload']>`,
			});
			continue;
		}

		if (workflow.script_name) {
			envTypeStructure.push({
				key: key,
				type: `Workflow /* ${workflow.class_name} from ${workflow.script_name} */`,
			});
			continue;
		}

		envTypeStructure.push({
			key,
			type: `Workflow /* ${workflow.class_name} */`,
		});
	}

	for (const unsafe of collectedUnsafeBindings) {
		if (unsafe.type === "ratelimit") {
			envTypeStructure.push({
				key: constructTypeKey(unsafe.name),
				type: "RateLimit",
			});
			continue;
		}

		envTypeStructure.push({
			key: constructTypeKey(unsafe.name),
			type: "any",
		});
	}

	// Data blobs are not environment-specific
	if (config.data_blobs) {
		for (const dataBlobs in config.data_blobs) {
			envTypeStructure.push({
				key: constructTypeKey(dataBlobs),
				type: "ArrayBuffer",
			});
		}
	}

	// Text blobs are not environment-specific
	if (config.text_blobs) {
		for (const textBlobs in config.text_blobs) {
			envTypeStructure.push({
				key: constructTypeKey(textBlobs),
				type: "string",
			});
		}
	}

	const modulesTypeStructure = new Array<string>();
	if (config.rules) {
		const moduleTypeMap = {
			CompiledWasm: "WebAssembly.Module",
			Data: "ArrayBuffer",
			Text: "string",
		};
		for (const ruleObject of config.rules) {
			const typeScriptType =
				moduleTypeMap[ruleObject.type as keyof typeof moduleTypeMap];
			if (typeScriptType === undefined) {
				continue;
			}

			for (const glob of ruleObject.globs) {
				modulesTypeStructure.push(`declare module "${constructTSModuleGlob(glob)}" {
\tconst value: ${typeScriptType};
\texport default value;
}`);
			}
		}
	}

	const typesHaveBeenFound =
		envTypeStructure.length > 0 || modulesTypeStructure.length > 0;
	if (entrypointFormat === "modules" || typesHaveBeenFound) {
		const { consoleOutput, fileContent } = generateTypeStrings(
			entrypointFormat,
			envInterface,
			envTypeStructure.map(({ key, type }) => `${key}: ${type};`),
			modulesTypeStructure,
			stringKeys,
			config.compatibility_date,
			config.compatibility_flags,
			entrypoint
				? generateImportSpecifier(fullOutputPath, entrypoint.file)
				: undefined,
			[...getDurableObjectClassNameToUseSQLiteMap(config.migrations).keys()],
			typeDefinitions
		);

		const hash = createHash("sha256")
			.update(consoleOutput)
			.digest("hex")
			.slice(0, 32);

		if (log) {
			logger.log(chalk.dim(consoleOutput));
		}

		return {
			envHeader: getEnvHeader(hash, command),
			envTypes: fileContent,
		};
	} else {
		if (log) {
			logger.log(chalk.dim("No project types to add.\n"));
		}

		return {
			envHeader: undefined,
			envTypes: undefined,
		};
	}
}

/**
 * Generates per-environment interface types plus an aggregated `Env` interface.
 *
 * Used when named environments exist and no `--env` flag is specified.
 *
 * @param config - The parsed Wrangler configuration object
 * @param collectionArgs - CLI arguments for collecting bindings
 * @param envInterface - The name of the generated environment interface
 * @param outputPath - The file path where the generated types will be written
 * @param entrypoint - Optional entry point information for the Worker
 * @param serviceEntries - Optional map of service names to their entry points for cross-worker type generation
 * @param secrets - Record of secret variable names (fallback for all envs when perEnvSecrets is not provided)
 * @param perEnvSecrets - Optional per-environment secrets map. When provided, each env uses its own secrets instead of the shared fallback.
 * @param command - Optional command string used in the generated env header.
 * @param log - Whether to log output to the console (default: true)
 *
 * @returns An object containing the generated header comment and type definitions, or undefined values if no types were generated
 */
async function generatePerEnvironmentTypes(
	config: Config,
	collectionArgs: Partial<(typeof typesCommand)["args"]>,
	envInterface: string,
	outputPath: string,
	entrypoint?: Entry,
	serviceEntries?: Map<string, Entry>,
	secrets: Record<string, string> = {},
	perEnvSecrets?: Map<string, Record<string, string>>,
	command?: string,
	log = true
): Promise<{ envHeader?: string; envTypes?: string }> {
	const { rawConfig } = experimental_readRawConfig(collectionArgs);
	const envNames = Object.keys(rawConfig.env ?? {});

	validateEnvInterfaceNames(envNames);

	const entrypointFormat = entrypoint?.format ?? "modules";
	const fullOutputPath = resolve(outputPath);

	const bindingsPerEnv = collectCoreBindingsPerEnvironment(collectionArgs);
	const varsPerEnv = collectVarsPerEnvironment(collectionArgs);
	const durableObjectsPerEnv =
		collectDurableObjectsPerEnvironment(collectionArgs);
	const servicesPerEnv = collectServicesPerEnvironment(collectionArgs);
	const workflowsPerEnv = collectWorkflowsPerEnvironment(collectionArgs);
	const unsafePerEnv = collectUnsafeBindingsPerEnvironment(collectionArgs);
	const pipelinesPerEnv = collectPipelinesPerEnvironment(collectionArgs);

	// Track all binding names and their types across all environments for aggregation
	const aggregatedBindings = new Map<
		string, // Binding name
		Set<string> // Set of types
	>();

	// Track which environments each binding appears in
	const bindingPresence = new Map<string, Set<string>>();

	const allEnvNames = [TOP_LEVEL_ENV_NAME, ...envNames];

	function trackBinding(name: string, type: string, envName: string): void {
		let types = aggregatedBindings.get(name);
		let presence = bindingPresence.get(name);

		if (!types) {
			types = new Set();
			aggregatedBindings.set(name, types);
		}

		if (!presence) {
			presence = new Set();
			bindingPresence.set(name, presence);
		}

		types.add(type);
		presence.add(envName);
	}

	function getDurableObjectType(durableObject: {
		name: string;
		class_name: string;
		script_name?: string;
	}): string {
		const doEntrypoint = durableObject.script_name
			? serviceEntries?.get(durableObject.script_name)
			: entrypoint;

		const importPath = doEntrypoint
			? generateImportSpecifier(fullOutputPath, doEntrypoint.file)
			: undefined;

		const exportExists = doEntrypoint?.exports?.some(
			(e) => e === durableObject.class_name
		);

		if (importPath && exportExists) {
			return `DurableObjectNamespace<import("${importPath}").${durableObject.class_name}>`;
		}

		if (durableObject.script_name) {
			return `DurableObjectNamespace /* ${durableObject.class_name} from ${durableObject.script_name} */`;
		}

		return `DurableObjectNamespace /* ${durableObject.class_name} */`;
	}

	function getServiceType(service: {
		binding: string;
		service: string;
		entrypoint?: string;
	}): string {
		const serviceEntry =
			service.service !== entrypoint?.name
				? serviceEntries?.get(service.service)
				: entrypoint;

		const importPath = serviceEntry
			? generateImportSpecifier(fullOutputPath, serviceEntry.file)
			: undefined;

		const exportExists = serviceEntry?.exports?.some(
			(e) => e === (service.entrypoint ?? "default")
		);

		if (importPath && exportExists) {
			return `Service<typeof import("${importPath}").${service.entrypoint ?? "default"}>`;
		}

		if (service.entrypoint) {
			return `Service /* entrypoint ${service.entrypoint} from ${service.service} */`;
		}

		return `Fetcher /* ${service.service} */`;
	}

	function getWorkflowType(workflow: {
		binding: string;
		name: string;
		class_name: string;
		script_name?: string;
	}): string {
		const workflowEntrypoint = workflow.script_name
			? serviceEntries?.get(workflow.script_name)
			: entrypoint;

		const importPath = workflowEntrypoint
			? generateImportSpecifier(fullOutputPath, workflowEntrypoint.file)
			: undefined;

		const exportExists = workflowEntrypoint?.exports?.some(
			(e) => e === workflow.class_name
		);

		if (importPath && exportExists) {
			return `Workflow<Parameters<import("${importPath}").${workflow.class_name}['run']>[0]['payload']>`;
		}

		if (workflow.script_name) {
			return `Workflow /* ${workflow.class_name} from ${workflow.script_name} */`;
		}

		return `Workflow /* ${workflow.class_name} */`;
	}

	const perEnvInterfaces = new Array<string>();
	const stringKeys = new Array<string>();
	// Track named type definitions (e.g., `type MyStreamRecord = {...}`) to be added to the Cloudflare namespace
	const typeDefinitions = new Set<string>();

	for (const envName of envNames) {
		const interfaceName = toEnvInterfaceName(envName);
		const envBindings = new Array<{ key: string; value: string }>();
		const envSecrets = perEnvSecrets?.get(envName) ?? secrets;

		const bindings = bindingsPerEnv.get(envName) ?? [];
		for (const binding of bindings) {
			envBindings.push({
				key: constructTypeKey(binding.name),
				value: binding.type,
			});
			trackBinding(binding.name, binding.type, envName);
		}

		const vars = varsPerEnv.get(envName) ?? {};
		for (const [varName, varValues] of Object.entries(vars)) {
			if (varName in envSecrets) {
				continue;
			}

			const varType =
				varValues.length === 1 ? varValues[0] : varValues.join(" | ");
			envBindings.push({ key: constructTypeKey(varName), value: varType });
			trackBinding(varName, varType, envName);
			if (!stringKeys.includes(varName)) {
				stringKeys.push(varName);
			}
		}

		for (const secretName in envSecrets) {
			envBindings.push({ key: constructTypeKey(secretName), value: "string" });
			trackBinding(secretName, "string", envName);
			if (!stringKeys.includes(secretName)) {
				stringKeys.push(secretName);
			}
		}

		const durableObjects = durableObjectsPerEnv.get(envName) ?? [];
		for (const durableObject of durableObjects) {
			const type = getDurableObjectType(durableObject);
			envBindings.push({
				key: constructTypeKey(durableObject.name),
				value: type,
			});
			trackBinding(durableObject.name, type, envName);
		}

		const services = servicesPerEnv.get(envName) ?? [];
		for (const service of services) {
			const type = getServiceType(service);
			envBindings.push({ key: constructTypeKey(service.binding), value: type });
			trackBinding(service.binding, type, envName);
		}

		const workflows = workflowsPerEnv.get(envName) ?? [];
		for (const workflow of workflows) {
			const type = getWorkflowType(workflow);
			envBindings.push({
				key: constructTypeKey(workflow.binding),
				value: type,
			});
			trackBinding(workflow.binding, type, envName);
		}

		const unsafeBindings = unsafePerEnv.get(envName) ?? [];
		for (const unsafe of unsafeBindings) {
			const type = unsafe.type === "ratelimit" ? "RateLimit" : "any";
			envBindings.push({ key: constructTypeKey(unsafe.name), value: type });
			trackBinding(unsafe.name, type, envName);
		}

		const envPipelines = pipelinesPerEnv.get(envName) ?? [];
		if (envPipelines.length > 0) {
			const pipelineTypes = await fetchPipelineTypes(config, envPipelines);
			for (const pipelineType of pipelineTypes) {
				// For service-worker format, type definitions are at the top level (not in Cloudflare namespace)
				// so we need to strip the "Cloudflare." prefix from the type reference
				const typeRef =
					entrypointFormat === "service-worker"
						? pipelineType.type.replace("Cloudflare.", "")
						: pipelineType.type;
				envBindings.push({
					key: constructTypeKey(pipelineType.binding),
					value: typeRef,
				});
				trackBinding(pipelineType.binding, typeRef, envName);
				if (pipelineType.typeDefinition) {
					typeDefinitions.add(pipelineType.typeDefinition);
				}
			}
		}

		if (envBindings.length > 0) {
			const bindingLines = envBindings
				.map(({ key, value }) => `\t\t${key}: ${value};`)
				.join("\n");
			perEnvInterfaces.push(
				`\tinterface ${interfaceName} {\n${bindingLines}\n\t}`
			);
		} else {
			perEnvInterfaces.push(`\tinterface ${interfaceName} {}`);
		}
	}

	const topLevelBindings = bindingsPerEnv.get(TOP_LEVEL_ENV_NAME) ?? [];
	for (const binding of topLevelBindings) {
		trackBinding(binding.name, binding.type, TOP_LEVEL_ENV_NAME);
	}

	const topLevelSecrets = perEnvSecrets?.get(TOP_LEVEL_ENV_NAME) ?? secrets;

	const topLevelVars = varsPerEnv.get(TOP_LEVEL_ENV_NAME) ?? {};
	for (const [varName, varValues] of Object.entries(topLevelVars)) {
		if (varName in topLevelSecrets) {
			continue;
		}

		const varType =
			varValues.length === 1 ? varValues[0] : varValues.join(" | ");
		trackBinding(varName, varType, TOP_LEVEL_ENV_NAME);
		if (!stringKeys.includes(varName)) {
			stringKeys.push(varName);
		}
	}

	for (const secretName in topLevelSecrets) {
		trackBinding(secretName, "string", TOP_LEVEL_ENV_NAME);
		if (!stringKeys.includes(secretName)) {
			stringKeys.push(secretName);
		}
	}

	const topLevelDOs = durableObjectsPerEnv.get(TOP_LEVEL_ENV_NAME) ?? [];
	for (const durableObject of topLevelDOs) {
		const type = getDurableObjectType(durableObject);
		trackBinding(durableObject.name, type, TOP_LEVEL_ENV_NAME);
	}

	const topLevelServices = servicesPerEnv.get(TOP_LEVEL_ENV_NAME) ?? [];
	for (const service of topLevelServices) {
		const type = getServiceType(service);
		trackBinding(service.binding, type, TOP_LEVEL_ENV_NAME);
	}

	const topLevelWorkflows = workflowsPerEnv.get(TOP_LEVEL_ENV_NAME) ?? [];
	for (const workflow of topLevelWorkflows) {
		const type = getWorkflowType(workflow);
		trackBinding(workflow.binding, type, TOP_LEVEL_ENV_NAME);
	}

	const topLevelUnsafe = unsafePerEnv.get(TOP_LEVEL_ENV_NAME) ?? [];
	for (const unsafe of topLevelUnsafe) {
		const type = unsafe.type === "ratelimit" ? "RateLimit" : "any";
		trackBinding(unsafe.name, type, TOP_LEVEL_ENV_NAME);
	}

	const topLevelPipelines = pipelinesPerEnv.get(TOP_LEVEL_ENV_NAME) ?? [];
	if (topLevelPipelines.length > 0) {
		const pipelineTypes = await fetchPipelineTypes(config, topLevelPipelines);
		for (const pipelineType of pipelineTypes) {
			// For service-worker format, type definitions are at the top level (not in Cloudflare namespace)
			// so we need to strip the "Cloudflare." prefix from the type reference
			const typeRef =
				entrypointFormat === "service-worker"
					? pipelineType.type.replace("Cloudflare.", "")
					: pipelineType.type;
			trackBinding(pipelineType.binding, typeRef, TOP_LEVEL_ENV_NAME);
			if (pipelineType.typeDefinition) {
				typeDefinitions.add(pipelineType.typeDefinition);
			}
		}
	}

	const aggregatedEnvBindings = new Array<{
		key: string;
		required: boolean;
		type: string;
	}>();

	for (const [name, types] of aggregatedBindings.entries()) {
		const typeArray = Array.from(types);
		const unionType =
			typeArray.length === 1 ? typeArray[0] : typeArray.join(" | ");
		const presence = bindingPresence.get(name);

		// Required if present in all environments (top-level + all named envs)
		const isRequired = presence
			? allEnvNames.every((env) => presence.has(env))
			: false;

		aggregatedEnvBindings.push({
			key: constructTypeKey(name),
			required: isRequired,
			type: unionType,
		});
	}

	// Data blobs are not environment-specific, add to aggregated `Env`
	if (config.data_blobs) {
		for (const dataBlobs in config.data_blobs) {
			aggregatedEnvBindings.push({
				key: constructTypeKey(dataBlobs),
				required: true,
				type: "ArrayBuffer",
			});
		}
	}

	// Text blobs are not environment-specific, add to aggregated `Env`
	if (config.text_blobs) {
		for (const textBlobs in config.text_blobs) {
			aggregatedEnvBindings.push({
				key: constructTypeKey(textBlobs),
				required: true,
				type: "string",
			});
		}
	}

	const modulesTypeStructure = new Array<string>();
	if (config.rules) {
		const moduleTypeMap = {
			CompiledWasm: "WebAssembly.Module",
			Data: "ArrayBuffer",
			Text: "string",
		};
		for (const ruleObject of config.rules) {
			const typeScriptType =
				moduleTypeMap[ruleObject.type as keyof typeof moduleTypeMap];
			if (typeScriptType !== undefined) {
				for (const glob of ruleObject.globs) {
					modulesTypeStructure.push(`declare module "${constructTSModuleGlob(glob)}" {
	const value: ${typeScriptType};
	export default value;
	}`);
				}
			}
		}
	}

	const { consoleOutput, fileContent } = generatePerEnvTypeStrings(
		entrypointFormat,
		envInterface,
		perEnvInterfaces,
		aggregatedEnvBindings,
		modulesTypeStructure,
		stringKeys,
		config.compatibility_date,
		config.compatibility_flags,
		entrypoint
			? generateImportSpecifier(fullOutputPath, entrypoint.file)
			: undefined,
		[...getDurableObjectClassNameToUseSQLiteMap(config.migrations).keys()],
		[...typeDefinitions]
	);

	const hash = createHash("sha256")
		.update(consoleOutput)
		.digest("hex")
		.slice(0, 32);

	if (log) {
		logger.log(chalk.dim(consoleOutput));
	}

	return {
		envHeader: getEnvHeader(hash, command),
		envTypes: fileContent,
	};
}

/**
 * Generates type strings for per-environment interfaces plus aggregated Env.
 *
 * @param formatType - The worker format type ("modules" or "service-worker")
 * @param envInterface - The name of the generated environment interface
 * @param perEnvInterfaces - Array of per-environment interface strings
 * @param aggregatedEnvBindings - Array of aggregated environment bindings as [key, type, required]
 * @param modulesTypeStructure - Array of module type declaration strings
 * @param stringKeys - Array of variable names that should be typed as strings in process.env
 * @param compatibilityDate - Compatibility date for the worker
 * @param compatibilityFlags - Compatibility flags for the worker
 * @param entrypointModule - The import specifier for the main entrypoint module
 * @param configuredDurableObjects - Array of configured Durable Object class names
 *
 * @returns An object containing the complete file content and console output strings
 */
function generatePerEnvTypeStrings(
	formatType: string,
	envInterface: string,
	perEnvInterfaces: string[],
	aggregatedEnvBindings: Array<{
		key: string;
		required: boolean;
		type: string;
	}>,
	modulesTypeStructure: string[],
	stringKeys: string[],
	compatibilityDate: string | undefined,
	compatibilityFlags: string[] | undefined,
	entrypointModule: string | undefined,
	configuredDurableObjects: string[],
	typeDefinitions: string[] = []
): { fileContent: string; consoleOutput: string } {
	let baseContent = "";
	let processEnv = "";

	// Named type definitions go inside the Cloudflare namespace
	const typeDefsContent =
		typeDefinitions.length > 0
			? typeDefinitions.map((def) => `\t${def}`).join("\n")
			: "";

	if (formatType === "modules") {
		if (
			isProcessEnvPopulated(compatibilityDate, compatibilityFlags) &&
			stringKeys.length > 0
		) {
			processEnv = `\ntype StringifyValues<EnvType extends Record<string, unknown>> = {\n\t[Binding in keyof EnvType]: EnvType[Binding] extends string ? EnvType[Binding] : string;\n};\ndeclare namespace NodeJS {\n\tinterface ProcessEnv extends StringifyValues<Pick<Cloudflare.Env, ${stringKeys.map((k) => `"${k}"`).join(" | ")}>> {}\n}`;
		}

		const perEnvContent = perEnvInterfaces.join("\n");

		const envBindingLines = aggregatedEnvBindings
			.map((b) => `\t\t${b.key}${b.required ? "" : "?"}: ${b.type};`)
			.join("\n");

		const globalPropsContent = entrypointModule
			? `\n\tinterface GlobalProps {\n\t\tmainModule: typeof import("${entrypointModule}");${configuredDurableObjects.length > 0 ? `\n\t\tdurableNamespaces: ${configuredDurableObjects.map((d) => `"${d}"`).join(" | ")};` : ""}\n\t}`
			: "";

		baseContent = `declare namespace Cloudflare {${globalPropsContent}${typeDefsContent ? `\n${typeDefsContent}` : ""}\n${perEnvContent}\n\tinterface Env {\n${envBindingLines}\n\t}\n}\ninterface ${envInterface} extends Cloudflare.Env {}${processEnv}`;
	} else {
		// Service worker syntax - type definitions go at the top level since there's no namespace
		const globalTypeDefsContent =
			typeDefinitions.length > 0 ? typeDefinitions.join("\n") + "\n" : "";
		const envBindingLines = aggregatedEnvBindings
			.map(({ key, type }) => `\tconst ${key}: ${type};`)
			.join("\n");
		baseContent = `${globalTypeDefsContent}export {};\ndeclare global {\n${envBindingLines}\n}`;
	}

	const modulesContent = modulesTypeStructure.join("\n");

	return {
		consoleOutput: `${baseContent}\n${modulesContent}`,
		fileContent: `${baseContent}\n${modulesContent}`,
	};
}

/**
 * Checks if a .d.ts file at the given path exists and was not generated by Wrangler.
 *
 * @param path - The path to the .d.ts file to check.
 *
 * @returns void if no conflicting file exists.
 *
 * @throws {Error} If an unexpected error occurs while reading the file.
 * @throws {UserError} If a non-Wrangler .d.ts file already exists at the given path.
 */
const validateTypesFile = (path: string): void => {
	const wranglerOverrideDTSPath = find.file(path);
	if (wranglerOverrideDTSPath === undefined) {
		return;
	}

	try {
		const fileContent = fs.readFileSync(wranglerOverrideDTSPath, "utf8");
		if (
			!fileContent.includes("Generated by Wrangler") &&
			!fileContent.includes("Runtime types generated with workerd")
		) {
			throw new UserError(
				`A non-Wrangler ${basename(path)} already exists, please rename and try again.`,
				{
					telemetryMessage: "type generation validation conflicting types file",
				}
			);
		}
	} catch (error) {
		if (error instanceof Error && !error.message.includes("not found")) {
			throw error;
		}
	}
};

/**
 * Generates type strings for a single aggregated Env interface.
 *
 * @param formatType - The worker format type ("modules" or "service-worker")
 * @param envInterface - The name of the generated environment interface
 * @param envTypeStructure - Array of environment binding strings
 * @param modulesTypeStructure - Array of module type declaration strings
 * @param stringKeys - Array of variable names that should be typed as strings in process.env
 * @param compatibilityDate - Compatibility date for the worker
 * @param compatibilityFlags - Compatibility flags for the worker
 * @param entrypointModule - The entrypoint module path
 * @param configuredDurableObjects - Array of configured durable object names
 *
 * @returns An object containing the complete file content and console output strings
 */
function generateTypeStrings(
	formatType: string,
	envInterface: string,
	envTypeStructure: string[],
	modulesTypeStructure: string[],
	stringKeys: string[],
	compatibilityDate: string | undefined,
	compatibilityFlags: string[] | undefined,
	entrypointModule: string | undefined,
	configuredDurableObjects: string[],
	typeDefinitions: string[] = []
): {
	consoleOutput: string;
	fileContent: string;
} {
	let baseContent = "";
	let processEnv = "";

	// Type definitions (e.g., pipeline record types) go inside the Cloudflare namespace
	const typeDefsContent =
		typeDefinitions.length > 0
			? typeDefinitions.map((def) => `\t${def}`).join("\n")
			: "";

	if (formatType === "modules") {
		if (
			isProcessEnvPopulated(compatibilityDate, compatibilityFlags) &&
			stringKeys.length > 0
		) {
			// StringifyValues ensures that json vars are correctly types as strings, not objects on process.env
			processEnv = `\ntype StringifyValues<EnvType extends Record<string, unknown>> = {\n\t[Binding in keyof EnvType]: EnvType[Binding] extends string ? EnvType[Binding] : string;\n};\ndeclare namespace NodeJS {\n\tinterface ProcessEnv extends StringifyValues<Pick<Cloudflare.Env, ${stringKeys.map((k) => `"${k}"`).join(" | ")}>> {}\n}`;
		}
		baseContent = `declare namespace Cloudflare {${entrypointModule ? `\n\tinterface GlobalProps {\n\t\tmainModule: typeof import("${entrypointModule}");${configuredDurableObjects.length > 0 ? `\n\t\tdurableNamespaces: ${configuredDurableObjects.map((d) => `"${d}"`).join(" | ")};` : ""}\n\t}` : ""}${typeDefsContent ? `\n${typeDefsContent}` : ""}\n\tinterface Env {${envTypeStructure.map((value) => `\n\t\t${value}`).join("")}\n\t}\n}\ninterface ${envInterface} extends Cloudflare.Env {}${processEnv}`;
	} else {
		// For service worker format, type definitions still go at the top level since there's no namespace
		const globalTypeDefsContent =
			typeDefinitions.length > 0 ? typeDefinitions.join("\n") + "\n" : "";
		baseContent = `${globalTypeDefsContent}export {};\ndeclare global {\n${envTypeStructure.map((value) => `\tconst ${value}`).join("\n")}\n}`;
	}

	const modulesContent = modulesTypeStructure.join("\n");

	return {
		fileContent: `${baseContent}\n${modulesContent}`,
		consoleOutput: `${baseContent}\n${modulesContent}`,
	};
}

/**
 * Attempts to read the tsconfig.json at the current path.
 *
 * @param tsconfigPath - The path to the tsconfig.json file
 *
 * @returns An array of types defined in the tsconfig.json's compilerOptions.types, or an empty array if not found or on error
 */
function readTsconfigTypes(tsconfigPath: string): string[] {
	if (!fs.existsSync(tsconfigPath)) {
		return [];
	}

	try {
		const tsconfig = parseJSONC(
			fs.readFileSync(tsconfigPath, "utf-8")
		) as TSConfig;
		return tsconfig.compilerOptions?.types || [];
	} catch {
		return [];
	}
}

type TSConfig = {
	compilerOptions: {
		types: string[];
	};
};

/**
 * Retrieves the environment config for a specific environment name, throwing if it doesn't exist.
 *
 * @param environmentName - The environment name specified via --env
 * @param rawConfig - The raw config object
 *
 * @returns The environment config object
 *
 * @throws {UserError} If the environment doesn't exist in the config
 */
function getEnvConfig(
	environmentName: string,
	rawConfig: { env?: Record<string, RawEnvironment> }
): RawEnvironment {
	const envConfig = rawConfig.env?.[environmentName];
	if (!envConfig) {
		const availableEnvs = Object.keys(rawConfig.env ?? {});
		const envList =
			availableEnvs.length > 0
				? `Available environments: ${availableEnvs.join(", ")}`
				: "No environments are defined in the configuration file.";
		throw new UserError(
			`Environment "${environmentName}" not found in configuration.\n${envList}`,
			{ telemetryMessage: "type generation config missing environment" }
		);
	}

	return envConfig;
}

/**
 * Collects all the vars types across all the environments defined in the config file
 *
 * Behavior:
 * - If `args.env` is specified: only collect vars from that specific environment
 * - Otherwise: collect vars from top-level AND all named environments
 *
 * @param args all the CLI arguments passed to the `types` command
 *
 * @returns an object which keys are the variable names and values are arrays containing all the computed types for such variables
 */
function collectAllVars(
	args: Partial<(typeof typesCommand)["args"]>
): Record<string, string[]> {
	const varsInfo: Record<string, Set<string>> = {};

	// Collects onto the `varsInfo` object the vars and values for a specific environment
	function collectEnvironmentVars(vars: RawEnvironment["vars"]) {
		Object.entries(vars ?? {}).forEach(([key, value]) => {
			varsInfo[key] ??= new Set();

			if (!args.strictVars) {
				// when strict-vars is false we basically only want the plain "typeof" values
				varsInfo[key].add(
					Array.isArray(value) ? typeofArray(value) : typeof value
				);
				return;
			}

			if (
				typeof value === "string" ||
				typeof value === "number" ||
				typeof value === "boolean" ||
				typeof value === "object"
			) {
				varsInfo[key].add(JSON.stringify(value));
				return;
			}

			// let's fallback to a safe `unknown` if we couldn't detect the type
			varsInfo[key].add("unknown");
		});
	}

	const { rawConfig } = experimental_readRawConfig(args);

	if (args.env) {
		const envConfig = getEnvConfig(args.env, rawConfig);
		collectEnvironmentVars(envConfig.vars);
	} else {
		collectEnvironmentVars(rawConfig.vars);
		for (const env of Object.values(rawConfig.env ?? {})) {
			collectEnvironmentVars(env.vars);
		}
	}

	return Object.fromEntries(
		Object.entries(varsInfo).map(([key, value]) => [key, [...value]])
	);
}

/**
 * Given an array it returns a string representing the types present in such array
 *
 * @param array the target array
 *
 * @returns a string representing the types of such array
 *
 * @example
 * `[1, 2, 3]` => `number[]`
 * `[1, 2, 'three']` => `(number|string)[]`
 * `['false', true]` => `(string|boolean)[]`
 */
function typeofArray(array: unknown[]): string {
	const typesInArray = [...new Set(array.map((item) => typeof item))].sort();

	if (typesInArray.length === 1) {
		return `${typesInArray[0]}[]`;
	}

	return `(${typesInArray.join("|")})[]`;
}

interface CollectedBinding {
	/**
	 * The binding category (e.g., "kv_namespaces", "d1_databases")
	 */
	bindingCategory: string;

	/**
	 * The binding name (e.g., "MY_KV_NAMESPACE")
	 */
	name: string;

	/**
	 * The TypeScript type (e.g., "KVNamespace")
	 */
	type: string;
}

/**
 * Collects all core bindings across environments defined in the config file
 *
 * This will aggregate and collect all bindings that can be collected in the same way.
 * However some other resources, such as Durable Objects, services, etc, all have to be
 * handled uniquely and as such have their own dedicated `collectX` functions.
 *
 * Behavior:
 * - If `args.env` is specified: only collect bindings from that specific environment
 * - Otherwise: collect bindings from top-level AND all named environments
 *
 * @param args - All the CLI arguments passed to the `types` command
 *
 * @returns An array of collected bindings with their names, types, and categories
 *
 * @throws {UserError} If a binding name exists with different types across environments
 */
function collectCoreBindings(
	args: Partial<(typeof typesCommand)["args"]>
): Array<CollectedBinding> {
	const bindingsMap = new Map<string, CollectedBinding>();

	function addBinding(
		name: string,
		type: string,
		bindingCategory: string,
		envName: string
	) {
		const existing = bindingsMap.get(name);
		if (existing) {
			if (existing.bindingCategory !== bindingCategory) {
				throw new UserError(
					`Binding "${name}" has conflicting types across environments: ` +
						`"${existing.bindingCategory}" vs "${bindingCategory}" (in ${envName}). ` +
						`Please use unique binding names for different binding types.`,
					{ telemetryMessage: "type generation bindings conflicting types" }
				);
			}

			return;
		}
		bindingsMap.set(name, { name, type, bindingCategory });
	}

	function collectEnvironmentBindings(
		env: RawEnvironment | undefined,
		envName: string
	) {
		if (!env) {
			return;
		}

		for (const [index, kv] of (env.kv_namespaces ?? []).entries()) {
			if (!kv.binding) {
				throwMissingBindingError({
					binding: kv,
					bindingType: "kv_namespaces",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			addBinding(kv.binding, "KVNamespace", "kv_namespaces", envName);
		}

		for (const [index, r2] of (env.r2_buckets ?? []).entries()) {
			if (!r2.binding) {
				throwMissingBindingError({
					binding: r2,
					bindingType: "r2_buckets",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			addBinding(r2.binding, "R2Bucket", "r2_buckets", envName);
		}

		for (const [index, d1] of (env.d1_databases ?? []).entries()) {
			if (!d1.binding) {
				throwMissingBindingError({
					binding: d1,
					bindingType: "d1_databases",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			addBinding(d1.binding, "D1Database", "d1_databases", envName);
		}

		for (const [index, vectorize] of (env.vectorize ?? []).entries()) {
			if (!vectorize.binding) {
				throwMissingBindingError({
					binding: vectorize,
					bindingType: "vectorize",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			addBinding(vectorize.binding, "VectorizeIndex", "vectorize", envName);
		}

		for (const [index, hyperdrive] of (env.hyperdrive ?? []).entries()) {
			if (!hyperdrive.binding) {
				throwMissingBindingError({
					binding: hyperdrive,
					bindingType: "hyperdrive",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			addBinding(hyperdrive.binding, "Hyperdrive", "hyperdrive", envName);
		}

		for (const [index, sendEmail] of (env.send_email ?? []).entries()) {
			if (!sendEmail.name) {
				throwMissingBindingError({
					binding: sendEmail,
					bindingType: "send_email",
					configPath: args.config,
					envName,
					fieldName: "name",
					index,
				});
			}

			addBinding(sendEmail.name, "SendEmail", "send_email", envName);
		}

		for (const [index, ae] of (env.analytics_engine_datasets ?? []).entries()) {
			if (!ae.binding) {
				throwMissingBindingError({
					binding: ae,
					bindingType: "analytics_engine_datasets",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			addBinding(
				ae.binding,
				"AnalyticsEngineDataset",
				"analytics_engine_datasets",
				envName
			);
		}

		for (const [index, dispatch] of (env.dispatch_namespaces ?? []).entries()) {
			if (!dispatch.binding) {
				throwMissingBindingError({
					binding: dispatch,
					bindingType: "dispatch_namespaces",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			addBinding(
				dispatch.binding,
				"DispatchNamespace",
				"dispatch_namespaces",
				envName
			);
		}

		for (const [index, mtls] of (env.mtls_certificates ?? []).entries()) {
			if (!mtls.binding) {
				throwMissingBindingError({
					binding: mtls,
					bindingType: "mtls_certificates",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			addBinding(mtls.binding, "Fetcher", "mtls_certificates", envName);
		}

		for (const [index, queue] of (env.queues?.producers ?? []).entries()) {
			if (!queue.binding) {
				throwMissingBindingError({
					binding: queue,
					bindingType: "queues.producers",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			addBinding(queue.binding, "Queue", "queues_producers", envName);
		}

		for (const [index, secret] of (env.secrets_store_secrets ?? []).entries()) {
			if (!secret.binding) {
				throwMissingBindingError({
					binding: secret,
					bindingType: "secrets_store_secrets",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			addBinding(
				secret.binding,
				"SecretsStoreSecret",
				"secrets_store_secrets",
				envName
			);
		}

		for (const [index, artifact] of (env.artifacts ?? []).entries()) {
			if (!artifact.binding) {
				throwMissingBindingError({
					binding: artifact,
					bindingType: "artifacts",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			addBinding(artifact.binding, "Artifacts", "artifacts", envName);
		}

		for (const [index, helloWorld] of (
			env.unsafe_hello_world ?? []
		).entries()) {
			if (!helloWorld.binding) {
				throwMissingBindingError({
					binding: helloWorld,
					bindingType: "unsafe_hello_world",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			addBinding(
				helloWorld.binding,
				"HelloWorldBinding",
				"unsafe_hello_world",
				envName
			);
		}

		for (const [index, flagshipBinding] of (env.flagship ?? []).entries()) {
			if (!flagshipBinding.binding) {
				throwMissingBindingError({
					binding: flagshipBinding,
					bindingType: "flagship",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			addBinding(flagshipBinding.binding, "Flagship", "flagship", envName);
		}

		for (const [index, ratelimit] of (env.ratelimits ?? []).entries()) {
			if (!ratelimit.name) {
				throwMissingBindingError({
					binding: ratelimit,
					bindingType: "ratelimits",
					configPath: args.config,
					envName,
					fieldName: "name",
					index,
				});
			}

			addBinding(ratelimit.name, "RateLimit", "ratelimits", envName);
		}

		for (const [index, workerLoader] of (env.worker_loaders ?? []).entries()) {
			if (!workerLoader.binding) {
				throwMissingBindingError({
					binding: workerLoader,
					bindingType: "worker_loaders",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			addBinding(
				workerLoader.binding,
				"WorkerLoader",
				"worker_loaders",
				envName
			);
		}

		for (const [index, vpcService] of (env.vpc_services ?? []).entries()) {
			if (!vpcService.binding) {
				throwMissingBindingError({
					binding: vpcService,
					bindingType: "vpc_services",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			addBinding(vpcService.binding, "Fetcher", "vpc_services", envName);
		}

		for (const [index, vpcNetwork] of (env.vpc_networks ?? []).entries()) {
			if (!vpcNetwork.binding) {
				throwMissingBindingError({
					binding: vpcNetwork,
					bindingType: "vpc_networks",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			addBinding(vpcNetwork.binding, "Fetcher", "vpc_networks", envName);
		}

		for (const [index, aiSearchNamespace] of (
			env.ai_search_namespaces ?? []
		).entries()) {
			if (!aiSearchNamespace.binding) {
				throwMissingBindingError({
					binding: aiSearchNamespace,
					bindingType: "ai_search_namespaces",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			addBinding(
				aiSearchNamespace.binding,
				"AiSearchNamespace",
				"ai_search_namespaces",
				envName
			);
		}

		for (const [index, aiSearch] of (env.ai_search ?? []).entries()) {
			if (!aiSearch.binding) {
				throwMissingBindingError({
					binding: aiSearch,
					bindingType: "ai_search",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			addBinding(aiSearch.binding, "AiSearchInstance", "ai_search", envName);
		}

		// Pipelines handled separately for async schema fetching

		if (env.logfwdr?.bindings?.length) {
			addBinding("LOGFWDR_SCHEMA", "any", "logfwdr", envName);
		}

		if (env.browser) {
			if (!env.browser.binding) {
				throwMissingBindingError({
					binding: env.browser,
					bindingType: "browser",
					configPath: args.config,
					envName,
					fieldName: "binding",
				});
			} else {
				addBinding(env.browser.binding, "Fetcher", "browser", envName);
			}
		}

		if (env.ai) {
			if (!env.ai.binding) {
				throwMissingBindingError({
					binding: env.ai,
					bindingType: "ai",
					configPath: args.config,
					envName,
					fieldName: "binding",
				});
			} else {
				addBinding(env.ai.binding, "Ai", "ai", envName);
			}
		}

		if (env.images) {
			if (!env.images.binding) {
				throwMissingBindingError({
					binding: env.images,
					bindingType: "images",
					configPath: args.config,
					envName,
					fieldName: "binding",
				});
			} else {
				addBinding(env.images.binding, "ImagesBinding", "images", envName);
			}
		}

		if (env.stream) {
			if (!env.stream.binding) {
				throwMissingBindingError({
					binding: env.stream,
					bindingType: "stream",
					configPath: args.config,
					envName,
					fieldName: "binding",
				});
			} else {
				addBinding(env.stream.binding, "StreamBinding", "stream", envName);
			}
		}

		if (env.media) {
			if (!env.media.binding) {
				throwMissingBindingError({
					binding: env.media,
					bindingType: "media",
					configPath: args.config,
					envName,
					fieldName: "binding",
				});
			} else {
				addBinding(env.media.binding, "MediaBinding", "media", envName);
			}
		}

		if (env.version_metadata) {
			if (!env.version_metadata.binding) {
				throwMissingBindingError({
					binding: env.version_metadata,
					bindingType: "version_metadata",
					configPath: args.config,
					envName,
					fieldName: "binding",
				});
			} else {
				addBinding(
					env.version_metadata.binding,
					"WorkerVersionMetadata",
					"version_metadata",
					envName
				);
			}
		}

		if (env.assets?.binding) {
			addBinding(env.assets.binding, "Fetcher", "assets", envName);
		}
	}

	const { rawConfig } = experimental_readRawConfig(args);

	if (args.env) {
		const envConfig = getEnvConfig(args.env, rawConfig);
		collectEnvironmentBindings(envConfig, args.env);
	} else {
		collectEnvironmentBindings(rawConfig, TOP_LEVEL_ENV_NAME);
		for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
			collectEnvironmentBindings(env, envName);
		}
	}

	return Array.from(bindingsMap.values());
}

/**
 * Collects Durable Object bindings across environments.
 *
 * This is separate because DOs need special handling for type generation.
 *
 * @param args - All the CLI arguments passed to the `types` command
 *
 * @returns An array of collected Durable Object bindings with their names, class name & possible script name.
 */
function collectAllDurableObjects(
	args: Partial<(typeof typesCommand)["args"]>
): Array<{
	class_name: string;
	name: string;
	script_name?: string;
}> {
	const durableObjectsMap = new Map<
		string,
		{
			class_name: string;
			name: string;
			script_name?: string;
		}
	>();

	function collectEnvironmentDOs(
		env: RawEnvironment | undefined,
		envName: string
	) {
		if (!env?.durable_objects?.bindings) {
			return;
		}

		for (const [index, doBinding] of env.durable_objects.bindings.entries()) {
			if (!doBinding.name) {
				throwMissingBindingError({
					binding: doBinding,
					bindingType: "durable_objects.bindings",
					configPath: args.config,
					envName,
					fieldName: "name",
					index,
				});
			}

			if (durableObjectsMap.has(doBinding.name)) {
				continue;
			}

			durableObjectsMap.set(doBinding.name, {
				class_name: doBinding.class_name,
				name: doBinding.name,
				script_name: doBinding.script_name,
			});
		}
	}

	const { rawConfig } = experimental_readRawConfig(args);

	if (args.env) {
		const envConfig = getEnvConfig(args.env, rawConfig);
		collectEnvironmentDOs(envConfig, args.env);
	} else {
		collectEnvironmentDOs(rawConfig, TOP_LEVEL_ENV_NAME);
		for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
			collectEnvironmentDOs(env, envName);
		}
	}

	return Array.from(durableObjectsMap.values());
}

/**
 * Collects Service bindings across environments.
 *
 * This is separate because services need special handling for type generation.
 *
 * @param args - All the CLI arguments passed to the `types` command
 *
 * @returns An array of collected service bindings with their binding, service & possible entrypoint.
 */
function collectAllServices(
	args: Partial<(typeof typesCommand)["args"]>
): Array<{
	binding: string;
	service: string;
	entrypoint?: string;
}> {
	const servicesMap = new Map<
		string,
		{
			binding: string;
			entrypoint?: string;
			service: string;
		}
	>();

	function collectEnvironmentServices(
		env: RawEnvironment | undefined,
		envName: string
	) {
		if (!env?.services) {
			return;
		}

		for (const [index, service] of env.services.entries()) {
			if (!service.binding) {
				throwMissingBindingError({
					binding: service,
					bindingType: "services",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			if (servicesMap.has(service.binding)) {
				continue;
			}

			servicesMap.set(service.binding, {
				binding: service.binding,
				entrypoint: service.entrypoint,
				service: service.service,
			});
		}
	}

	const { rawConfig } = experimental_readRawConfig(args);

	if (args.env) {
		const envConfig = getEnvConfig(args.env, rawConfig);
		collectEnvironmentServices(envConfig, args.env);
	} else {
		collectEnvironmentServices(rawConfig, TOP_LEVEL_ENV_NAME);
		for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
			collectEnvironmentServices(env, envName);
		}
	}

	return Array.from(servicesMap.values());
}

/**
 * Collects Workflow bindings across environments.
 *
 * This is separate because workflows need special handling for type generation.
 *
 * @param args - All the CLI arguments passed to the `types` command
 *
 * @returns An array of collected workflow bindings with their names, class name, binding and possible script name.
 */
function collectAllWorkflows(
	args: Partial<(typeof typesCommand)["args"]>
): Array<{
	binding: string;
	name: string;
	class_name: string;
	script_name?: string;
}> {
	const workflowsMap = new Map<
		string,
		{
			binding: string;
			name: string;
			class_name: string;
			script_name?: string;
		}
	>();

	function collectEnvironmentWorkflows(
		env: RawEnvironment | undefined,
		envName: string
	) {
		if (!env?.workflows) {
			return;
		}

		for (const [index, workflow] of env.workflows.entries()) {
			if (!workflow.binding) {
				throwMissingBindingError({
					binding: workflow,
					bindingType: "workflows",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			if (workflowsMap.has(workflow.binding)) {
				continue;
			}

			workflowsMap.set(workflow.binding, {
				binding: workflow.binding,
				name: workflow.name,
				class_name: workflow.class_name,
				script_name: workflow.script_name,
			});
		}
	}

	const { rawConfig } = experimental_readRawConfig(args);

	if (args.env) {
		const envConfig = getEnvConfig(args.env, rawConfig);
		collectEnvironmentWorkflows(envConfig, args.env);
	} else {
		collectEnvironmentWorkflows(rawConfig, TOP_LEVEL_ENV_NAME);
		for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
			collectEnvironmentWorkflows(env, envName);
		}
	}

	return Array.from(workflowsMap.values());
}

/**
 * Collects unsafe bindings across environments.
 *
 * @param args - All the CLI arguments passed to the `types` command
 *
 * @returns An array of collected unsafe bindings with their names and type.
 */
function collectAllUnsafeBindings(
	args: Partial<(typeof typesCommand)["args"]>
): Array<{
	name: string;
	type: string;
}> {
	const unsafeMap = new Map<
		string,
		{
			name: string;
			type: string;
		}
	>();

	function collectEnvironmentUnsafe(
		env: RawEnvironment | undefined,
		envName: string
	) {
		if (!env?.unsafe?.bindings) {
			return;
		}

		for (const [index, binding] of env.unsafe.bindings.entries()) {
			if (!binding.name) {
				throwMissingBindingError({
					binding,
					bindingType: "unsafe.bindings",
					configPath: args.config,
					envName,
					fieldName: "name",
					index,
				});
			}

			if (unsafeMap.has(binding.name)) {
				continue;
			}

			unsafeMap.set(binding.name, {
				name: binding.name,
				type: binding.type,
			});
		}
	}

	const { rawConfig } = experimental_readRawConfig(args);

	if (args.env) {
		const envConfig = getEnvConfig(args.env, rawConfig);
		collectEnvironmentUnsafe(envConfig, args.env);
	} else {
		collectEnvironmentUnsafe(rawConfig, TOP_LEVEL_ENV_NAME);
		for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
			collectEnvironmentUnsafe(env, envName);
		}
	}

	return Array.from(unsafeMap.values());
}

/**
 * Collects pipeline bindings across environments.
 *
 * This is separate from collectCoreBindings because pipelines need async
 * schema fetching for typed bindings.
 *
 * @param args - All the CLI arguments passed to the `types` command
 *
 * @returns An array of collected pipeline bindings with their names and pipeline IDs.
 */
function collectAllPipelines(
	args: Partial<(typeof typesCommand)["args"]>
): Array<{
	binding: string;
	pipeline: string;
}> {
	const pipelinesMap = new Map<
		string,
		{
			binding: string;
			pipeline: string;
		}
	>();

	function collectEnvironmentPipelines(
		env: RawEnvironment | undefined,
		envName: string
	) {
		if (!env?.pipelines) {
			return;
		}

		for (const [index, pipeline] of env.pipelines.entries()) {
			if (!pipeline.binding) {
				throwMissingBindingError({
					binding: pipeline,
					bindingType: "pipelines",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			if (!pipeline.pipeline) {
				throwMissingBindingError({
					binding: pipeline,
					bindingType: "pipelines",
					configPath: args.config,
					envName,
					fieldName: "pipeline",
					index,
				});
			}

			if (pipelinesMap.has(pipeline.binding)) {
				continue;
			}

			pipelinesMap.set(pipeline.binding, {
				binding: pipeline.binding,
				pipeline: pipeline.pipeline,
			});
		}
	}

	const { rawConfig } = experimental_readRawConfig(args);

	if (args.env) {
		const envConfig = getEnvConfig(args.env, rawConfig);
		collectEnvironmentPipelines(envConfig, args.env);
	} else {
		collectEnvironmentPipelines(rawConfig, TOP_LEVEL_ENV_NAME);
		for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
			collectEnvironmentPipelines(env, envName);
		}
	}

	return Array.from(pipelinesMap.values());
}

const logHorizontalRule = () => {
	const screenWidth = process.stdout.columns;
	logger.log(chalk.dim("─".repeat(Math.min(screenWidth, 60))));
};

interface PerEnvBinding {
	bindingCategory: string;
	name: string;
	type: string;
}

interface InheritableBindingDefinition {
	/**
	 * The category name for this binding (used for identification)
	 */
	bindingCategory: string;

	/**
	 * Extract the binding name from the raw environment config
	 */
	getBindingName: (env: RawEnvironment | undefined) => string | undefined;

	/**
	 * Check if the environment defines this inheritable property at all.
	 *
	 * This is used to determine if inheritance should be skipped, even when
	 * the environment doesn't define a binding.
	 *
	 * For example, if an environment defines `assets: { directory: "/path" }`
	 * without a `binding`, this method returns `true`, indicating the property
	 * is defined and inheritance should be skipped.
	 */
	hasProperty: (env: RawEnvironment | undefined) => boolean;

	/**
	 * The TypeScript type for this binding
	 */
	type: string;
}

/**
 * List of bindings that come from inheritable config properties.
 *
 * These bindings, when defined at the top-level config, are inherited by
 * all named environments.
 *
 * The type generation needs to account for this inheritance when determining
 * if a binding should be required or optional in the aggregated `Env` interface.
 */
const INHERITABLE_BINDINGS = [
	{
		bindingCategory: "assets",
		getBindingName: (env) => env?.assets?.binding,
		hasProperty: (env) => env?.assets !== undefined,
		type: "Fetcher",
	},
] satisfies InheritableBindingDefinition[];

/**
 * Collects vars per environment, returning a map from environment name to vars.
 *
 * Top-level vars use the sentinel `TOP_LEVEL_ENV_NAME`.
 *
 * @param args - CLI arguments passed to the `types` command
 *
 * @returns A map of environment name to an object of var names to their type values
 */
function collectVarsPerEnvironment(
	args: Partial<(typeof typesCommand)["args"]>
): Map<string, Record<string, string[]>> {
	const result = new Map<string, Record<string, string[]>>();

	function collectVars(vars: RawEnvironment["vars"]): Record<string, string[]> {
		const varsInfo: Record<string, Set<string>> = {};

		Object.entries(vars ?? {}).forEach(([key, value]) => {
			varsInfo[key] ??= new Set();

			if (!args.strictVars) {
				varsInfo[key].add(
					Array.isArray(value) ? typeofArray(value) : typeof value
				);
				return;
			}

			if (
				typeof value === "string" ||
				typeof value === "number" ||
				typeof value === "boolean" ||
				typeof value === "object"
			) {
				varsInfo[key].add(JSON.stringify(value));
				return;
			}

			varsInfo[key].add("unknown");
		});

		return Object.fromEntries(
			Object.entries(varsInfo).map(([key, value]) => [key, [...value]])
		);
	}

	const { rawConfig } = experimental_readRawConfig(args);

	// Collect top-level vars
	const topLevelVars = collectVars(rawConfig.vars);
	if (Object.keys(topLevelVars).length > 0) {
		result.set(TOP_LEVEL_ENV_NAME, topLevelVars);
	}

	// Collect per-environment vars
	for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
		const envVars = collectVars(env.vars);
		if (Object.keys(envVars).length > 0) {
			result.set(envName, envVars);
		}
	}

	return result;
}

/**
 * Collects core bindings per environment, returning a map from environment name to bindings.
 *
 * Top-level bindings use the sentinel `TOP_LEVEL_ENV_NAME`.
 *
 * Unlike collectCoreBindings which aggregates all bindings, this function keeps them separate
 * per environment for per-environment interface generation.
 *
 * @param args - CLI arguments passed to the `types` command
 *
 * @returns A map of environment name to array of bindings
 */
function collectCoreBindingsPerEnvironment(
	args: Partial<(typeof typesCommand)["args"]>
): Map<string, Array<PerEnvBinding>> {
	const result = new Map<string, Array<PerEnvBinding>>();

	function collectEnvironmentBindings(
		env: RawEnvironment | undefined,
		envName: string
	): Array<PerEnvBinding> {
		if (!env) {
			return [];
		}

		const bindings = new Array<PerEnvBinding>();

		for (const [index, kv] of (env.kv_namespaces ?? []).entries()) {
			if (!kv.binding) {
				throwMissingBindingError({
					binding: kv,
					bindingType: "kv_namespaces",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "kv_namespaces",
				name: kv.binding,
				type: "KVNamespace",
			});
		}

		for (const [index, r2] of (env.r2_buckets ?? []).entries()) {
			if (!r2.binding) {
				throwMissingBindingError({
					binding: r2,
					bindingType: "r2_buckets",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "r2_buckets",
				name: r2.binding,
				type: "R2Bucket",
			});
		}

		for (const [index, d1] of (env.d1_databases ?? []).entries()) {
			if (!d1.binding) {
				throwMissingBindingError({
					binding: d1,
					bindingType: "d1_databases",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "d1_databases",
				name: d1.binding,
				type: "D1Database",
			});
		}

		for (const [index, vectorize] of (env.vectorize ?? []).entries()) {
			if (!vectorize.binding) {
				throwMissingBindingError({
					binding: vectorize,
					bindingType: "vectorize",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "vectorize",
				name: vectorize.binding,
				type: "VectorizeIndex",
			});
		}

		for (const [index, hyperdrive] of (env.hyperdrive ?? []).entries()) {
			if (!hyperdrive.binding) {
				throwMissingBindingError({
					binding: hyperdrive,
					bindingType: "hyperdrive",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "hyperdrive",
				name: hyperdrive.binding,
				type: "Hyperdrive",
			});
		}

		for (const [index, sendEmail] of (env.send_email ?? []).entries()) {
			if (!sendEmail.name) {
				throwMissingBindingError({
					binding: sendEmail,
					bindingType: "send_email",
					configPath: args.config,
					envName,
					fieldName: "name",
					index,
				});
			}

			bindings.push({
				bindingCategory: "send_email",
				name: sendEmail.name,
				type: "SendEmail",
			});
		}

		for (const [index, ae] of (env.analytics_engine_datasets ?? []).entries()) {
			if (!ae.binding) {
				throwMissingBindingError({
					binding: ae,
					bindingType: "analytics_engine_datasets",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "analytics_engine_datasets",
				name: ae.binding,
				type: "AnalyticsEngineDataset",
			});
		}

		for (const [index, dispatch] of (env.dispatch_namespaces ?? []).entries()) {
			if (!dispatch.binding) {
				throwMissingBindingError({
					binding: dispatch,
					bindingType: "dispatch_namespaces",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "dispatch_namespaces",
				name: dispatch.binding,
				type: "DispatchNamespace",
			});
		}

		for (const [index, mtls] of (env.mtls_certificates ?? []).entries()) {
			if (!mtls.binding) {
				throwMissingBindingError({
					binding: mtls,
					bindingType: "mtls_certificates",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "mtls_certificates",
				name: mtls.binding,
				type: "Fetcher",
			});
		}

		for (const [index, queue] of (env.queues?.producers ?? []).entries()) {
			if (!queue.binding) {
				throwMissingBindingError({
					binding: queue,
					bindingType: "queues.producers",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "queues_producers",
				name: queue.binding,
				type: "Queue",
			});
		}

		for (const [index, secret] of (env.secrets_store_secrets ?? []).entries()) {
			if (!secret.binding) {
				throwMissingBindingError({
					binding: secret,
					bindingType: "secrets_store_secrets",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "secrets_store_secrets",
				name: secret.binding,
				type: "SecretsStoreSecret",
			});
		}

		for (const [index, artifact] of (env.artifacts ?? []).entries()) {
			if (!artifact.binding) {
				throwMissingBindingError({
					binding: artifact,
					bindingType: "artifacts",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "artifacts",
				name: artifact.binding,
				type: "Artifacts",
			});
		}

		for (const [index, helloWorld] of (
			env.unsafe_hello_world ?? []
		).entries()) {
			if (!helloWorld.binding) {
				throwMissingBindingError({
					binding: helloWorld,
					bindingType: "unsafe_hello_world",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "unsafe_hello_world",
				name: helloWorld.binding,
				type: "HelloWorldBinding",
			});
		}

		for (const [index, flagshipBinding] of (env.flagship ?? []).entries()) {
			if (!flagshipBinding.binding) {
				throwMissingBindingError({
					binding: flagshipBinding,
					bindingType: "flagship",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "flagship",
				name: flagshipBinding.binding,
				type: "Flagship",
			});
		}

		for (const [index, ratelimit] of (env.ratelimits ?? []).entries()) {
			if (!ratelimit.name) {
				throwMissingBindingError({
					binding: ratelimit,
					bindingType: "ratelimits",
					configPath: args.config,
					envName,
					fieldName: "name",
					index,
				});
			}

			bindings.push({
				bindingCategory: "ratelimits",
				name: ratelimit.name,
				type: "RateLimit",
			});
		}

		for (const [index, workerLoader] of (env.worker_loaders ?? []).entries()) {
			if (!workerLoader.binding) {
				throwMissingBindingError({
					binding: workerLoader,
					bindingType: "worker_loaders",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "worker_loaders",
				name: workerLoader.binding,
				type: "WorkerLoader",
			});
		}

		for (const [index, vpcService] of (env.vpc_services ?? []).entries()) {
			if (!vpcService.binding) {
				throwMissingBindingError({
					binding: vpcService,
					bindingType: "vpc_services",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "vpc_services",
				name: vpcService.binding,
				type: "Fetcher",
			});
		}

		for (const [index, vpcNetwork] of (env.vpc_networks ?? []).entries()) {
			if (!vpcNetwork.binding) {
				throwMissingBindingError({
					binding: vpcNetwork,
					bindingType: "vpc_networks",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "vpc_networks",
				name: vpcNetwork.binding,
				type: "Fetcher",
			});
		}

		// Pipelines handled separately for async schema fetching

		if (env.logfwdr?.bindings?.length) {
			bindings.push({
				bindingCategory: "logfwdr",
				name: "LOGFWDR_SCHEMA",
				type: "any",
			});
		}

		if (env.browser) {
			if (!env.browser.binding) {
				throwMissingBindingError({
					binding: env.browser,
					bindingType: "browser",
					configPath: args.config,
					envName,
					fieldName: "binding",
				});
			} else {
				bindings.push({
					bindingCategory: "browser",
					name: env.browser.binding,
					type: "Fetcher",
				});
			}
		}

		if (env.ai) {
			if (!env.ai.binding) {
				throwMissingBindingError({
					binding: env.ai,
					bindingType: "ai",
					configPath: args.config,
					envName,
					fieldName: "binding",
				});
			} else {
				bindings.push({
					bindingCategory: "ai",
					name: env.ai.binding,
					type: "Ai",
				});
			}
		}

		if (env.images) {
			if (!env.images.binding) {
				throwMissingBindingError({
					binding: env.images,
					bindingType: "images",
					configPath: args.config,
					envName,
					fieldName: "binding",
				});
			} else {
				bindings.push({
					bindingCategory: "images",
					name: env.images.binding,
					type: "ImagesBinding",
				});
			}
		}

		if (env.stream) {
			if (!env.stream.binding) {
				throwMissingBindingError({
					binding: env.stream,
					bindingType: "stream",
					configPath: args.config,
					envName,
					fieldName: "binding",
				});
			} else {
				bindings.push({
					bindingCategory: "stream",
					name: env.stream.binding,
					type: "StreamBinding",
				});
			}
		}

		if (env.media) {
			if (!env.media.binding) {
				throwMissingBindingError({
					binding: env.media,
					bindingType: "media",
					configPath: args.config,
					envName,
					fieldName: "binding",
				});
			} else {
				bindings.push({
					bindingCategory: "media",
					name: env.media.binding,
					type: "MediaBinding",
				});
			}
		}

		if (env.version_metadata) {
			if (!env.version_metadata.binding) {
				throwMissingBindingError({
					binding: env.version_metadata,
					bindingType: "version_metadata",
					configPath: args.config,
					envName,
					fieldName: "binding",
				});
			} else {
				bindings.push({
					bindingCategory: "version_metadata",
					name: env.version_metadata.binding,
					type: "WorkerVersionMetadata",
				});
			}
		}

		if (env.assets?.binding) {
			bindings.push({
				bindingCategory: "assets",
				name: env.assets.binding,
				type: "Fetcher",
			});
		}

		for (const [index, aiSearchNamespace] of (
			env.ai_search_namespaces ?? []
		).entries()) {
			if (!aiSearchNamespace.binding) {
				throwMissingBindingError({
					binding: aiSearchNamespace,
					bindingType: "ai_search_namespaces",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "ai_search_namespaces",
				name: aiSearchNamespace.binding,
				type: "AiSearchNamespace",
			});
		}

		for (const [index, aiSearch] of (env.ai_search ?? []).entries()) {
			if (!aiSearch.binding) {
				throwMissingBindingError({
					binding: aiSearch,
					bindingType: "ai_search",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "ai_search",
				name: aiSearch.binding,
				type: "AiSearchInstance",
			});
		}

		return bindings;
	}

	const { rawConfig } = experimental_readRawConfig(args);

	const topLevelInheritableBindings: Array<{
		binding: PerEnvBinding;
		definition: InheritableBindingDefinition;
	}> = [];
	for (const inheritableDef of INHERITABLE_BINDINGS) {
		const bindingName = inheritableDef.getBindingName(rawConfig);
		if (!bindingName) {
			continue;
		}

		topLevelInheritableBindings.push({
			binding: {
				bindingCategory: inheritableDef.bindingCategory,
				name: bindingName,
				type: inheritableDef.type,
			},
			definition: inheritableDef,
		});
	}

	const topLevelBindings = collectEnvironmentBindings(
		rawConfig,
		TOP_LEVEL_ENV_NAME
	);
	if (topLevelBindings.length > 0) {
		result.set(TOP_LEVEL_ENV_NAME, topLevelBindings);
	}

	for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
		const envBindings = collectEnvironmentBindings(env, envName);

		// Add top-level inheritable bindings if not already present in this environment
		// (i.e., the environment doesn't override the inheritable property)
		for (const inheritable of topLevelInheritableBindings) {
			const alreadyHasBinding = envBindings.some(
				(b) => b.bindingCategory === inheritable.binding.bindingCategory
			);
			if (alreadyHasBinding) {
				continue;
			}

			// Skip inheriting if the env defines the property at all (even without a binding)
			if (inheritable.definition.hasProperty(env)) {
				continue;
			}

			envBindings.push(inheritable.binding);
		}

		if (envBindings.length > 0) {
			result.set(envName, envBindings);
		}
	}

	return result;
}

/**
 * Collects Durable Object bindings per environment.
 *
 * @param args - CLI arguments passed to the `types` command
 *
 * @returns A map of environment name to array of DO bindings
 */
function collectDurableObjectsPerEnvironment(
	args: Partial<(typeof typesCommand)["args"]>
): Map<
	string,
	Array<{
		class_name: string;
		name: string;
		script_name?: string;
	}>
> {
	const result = new Map<
		string,
		Array<{
			class_name: string;
			name: string;
			script_name?: string;
		}>
	>();

	function collectEnvironmentDOs(
		env: RawEnvironment | undefined,
		envName: string
	): Array<{ name: string; class_name: string; script_name?: string }> {
		const durableObjects = new Array<{
			name: string;
			class_name: string;
			script_name?: string;
		}>();

		if (!env?.durable_objects?.bindings) {
			return durableObjects;
		}

		for (const [index, doBinding] of env.durable_objects.bindings.entries()) {
			if (!doBinding.name) {
				throwMissingBindingError({
					binding: doBinding,
					bindingType: "durable_objects.bindings",
					configPath: args.config,
					envName,
					fieldName: "name",
					index,
				});
			}

			durableObjects.push({
				class_name: doBinding.class_name,
				name: doBinding.name,
				script_name: doBinding.script_name,
			});
		}

		return durableObjects;
	}

	const { rawConfig } = experimental_readRawConfig(args);

	const topLevelDOs = collectEnvironmentDOs(rawConfig, TOP_LEVEL_ENV_NAME);
	if (topLevelDOs.length > 0) {
		result.set(TOP_LEVEL_ENV_NAME, topLevelDOs);
	}

	for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
		const envDOs = collectEnvironmentDOs(env, envName);
		if (envDOs.length > 0) {
			result.set(envName, envDOs);
		}
	}

	return result;
}

/**
 * Collects Service bindings per environment.
 *
 * @param args - CLI arguments passed to the `types` command
 *
 * @returns A map of environment name to array of service bindings
 */
function collectServicesPerEnvironment(
	args: Partial<(typeof typesCommand)["args"]>
): Map<
	string,
	Array<{
		binding: string;
		entrypoint?: string;
		service: string;
	}>
> {
	const result = new Map<
		string,
		Array<{
			binding: string;
			entrypoint?: string;
			service: string;
		}>
	>();

	function collectEnvironmentServices(
		env: RawEnvironment | undefined,
		envName: string
	): Array<{
		binding: string;
		entrypoint?: string;
		service: string;
	}> {
		const services = new Array<{
			binding: string;
			service: string;
			entrypoint?: string;
		}>();

		if (!env?.services) {
			return services;
		}

		for (const [index, service] of env.services.entries()) {
			if (!service.binding) {
				throwMissingBindingError({
					binding: service,
					bindingType: "services",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			services.push({
				binding: service.binding,
				entrypoint: service.entrypoint,
				service: service.service,
			});
		}

		return services;
	}

	const { rawConfig } = experimental_readRawConfig(args);

	const topLevelServices = collectEnvironmentServices(
		rawConfig,
		TOP_LEVEL_ENV_NAME
	);
	if (topLevelServices.length > 0) {
		result.set(TOP_LEVEL_ENV_NAME, topLevelServices);
	}

	for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
		const envServices = collectEnvironmentServices(env, envName);
		if (envServices.length > 0) {
			result.set(envName, envServices);
		}
	}

	return result;
}

/**
 * Collects Workflow bindings per environment.
 *
 * @param args - CLI arguments passed to the `types` command
 *
 * @returns A map of environment name to array of workflow bindings
 */
function collectWorkflowsPerEnvironment(
	args: Partial<(typeof typesCommand)["args"]>
): Map<
	string,
	Array<{
		binding: string;
		class_name: string;
		name: string;
		script_name?: string;
	}>
> {
	const result = new Map<
		string,
		Array<{
			binding: string;
			class_name: string;
			name: string;
			script_name?: string;
		}>
	>();

	function collectEnvironmentWorkflows(
		env: RawEnvironment | undefined,
		envName: string
	): Array<{
		binding: string;
		class_name: string;
		name: string;
		script_name?: string;
	}> {
		const workflows = new Array<{
			binding: string;
			class_name: string;
			name: string;
			script_name?: string;
		}>();

		if (!env?.workflows) {
			return workflows;
		}

		for (const [index, workflow] of env.workflows.entries()) {
			if (!workflow.binding) {
				throwMissingBindingError({
					binding: workflow,
					bindingType: "workflows",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			workflows.push({
				binding: workflow.binding,
				class_name: workflow.class_name,
				name: workflow.name,
				script_name: workflow.script_name,
			});
		}

		return workflows;
	}

	const { rawConfig } = experimental_readRawConfig(args);

	const topLevelWorkflows = collectEnvironmentWorkflows(
		rawConfig,
		TOP_LEVEL_ENV_NAME
	);
	if (topLevelWorkflows.length > 0) {
		result.set(TOP_LEVEL_ENV_NAME, topLevelWorkflows);
	}

	for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
		const envWorkflows = collectEnvironmentWorkflows(env, envName);
		if (envWorkflows.length > 0) {
			result.set(envName, envWorkflows);
		}
	}

	return result;
}

/**
 * Collects unsafe bindings per environment.
 *
 * @param args - CLI arguments passed to the `types` command
 *
 * @returns A map of environment name to array of unsafe bindings
 */
function collectUnsafeBindingsPerEnvironment(
	args: Partial<(typeof typesCommand)["args"]>
): Map<
	string,
	Array<{
		name: string;
		type: string;
	}>
> {
	const result = new Map<
		string,
		Array<{
			name: string;
			type: string;
		}>
	>();

	function collectEnvironmentUnsafe(
		env: RawEnvironment | undefined,
		envName: string
	): Array<{
		name: string;
		type: string;
	}> {
		const unsafeBindings = new Array<{
			name: string;
			type: string;
		}>();

		if (!env?.unsafe?.bindings) {
			return unsafeBindings;
		}

		for (const [index, binding] of env.unsafe.bindings.entries()) {
			if (!binding.name) {
				throwMissingBindingError({
					binding,
					bindingType: "unsafe.bindings",
					configPath: args.config,
					envName,
					fieldName: "name",
					index,
				});
			}

			unsafeBindings.push({
				name: binding.name,
				type: binding.type,
			});
		}

		return unsafeBindings;
	}

	const { rawConfig } = experimental_readRawConfig(args);

	const topLevelUnsafe = collectEnvironmentUnsafe(
		rawConfig,
		TOP_LEVEL_ENV_NAME
	);
	if (topLevelUnsafe.length > 0) {
		result.set(TOP_LEVEL_ENV_NAME, topLevelUnsafe);
	}

	for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
		const envUnsafe = collectEnvironmentUnsafe(env, envName);
		if (envUnsafe.length > 0) {
			result.set(envName, envUnsafe);
		}
	}

	return result;
}

/**
 * Collects pipeline bindings per environment.
 *
 * This is separate from collectCoreBindingsPerEnvironment because pipelines
 * need async schema fetching for typed bindings.
 *
 * @param args - CLI arguments passed to the `types` command
 *
 * @returns A map of environment name to array of pipeline bindings
 */
function collectPipelinesPerEnvironment(
	args: Partial<(typeof typesCommand)["args"]>
): Map<
	string,
	Array<{
		binding: string;
		pipeline: string;
	}>
> {
	const result = new Map<
		string,
		Array<{
			binding: string;
			pipeline: string;
		}>
	>();

	function collectEnvironmentPipelines(
		env: RawEnvironment | undefined,
		envName: string
	): Array<{
		binding: string;
		pipeline: string;
	}> {
		const pipelines = new Array<{
			binding: string;
			pipeline: string;
		}>();

		if (!env?.pipelines) {
			return pipelines;
		}

		for (const [index, pipeline] of env.pipelines.entries()) {
			if (!pipeline.binding) {
				throwMissingBindingError({
					binding: pipeline,
					bindingType: "pipelines",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			if (!pipeline.pipeline) {
				throwMissingBindingError({
					binding: pipeline,
					bindingType: "pipelines",
					configPath: args.config,
					envName,
					fieldName: "pipeline",
					index,
				});
			}

			pipelines.push({
				binding: pipeline.binding,
				pipeline: pipeline.pipeline,
			});
		}

		return pipelines;
	}

	const { rawConfig } = experimental_readRawConfig(args);

	const topLevelPipelines = collectEnvironmentPipelines(
		rawConfig,
		TOP_LEVEL_ENV_NAME
	);
	if (topLevelPipelines.length > 0) {
		result.set(TOP_LEVEL_ENV_NAME, topLevelPipelines);
	}

	for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
		const envPipelines = collectEnvironmentPipelines(env, envName);
		if (envPipelines.length > 0) {
			result.set(envName, envPipelines);
		}
	}

	return result;
}
