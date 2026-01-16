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
import { findUpSync } from "find-up";
import { getNodeCompat } from "miniflare";
import { readConfig } from "../config";
import { createCommand } from "../core/create-command";
import { getEntry } from "../deployment-bundle/entry";
import { getDurableObjectClassNameToUseSQLiteMap } from "../dev/class-names-sqlite";
import { getVarsForDev } from "../dev/dev-vars";
import { logger } from "../logger";
import { isProcessEnvPopulated } from "../process-env";
import { checkTypesUpToDate, DEFAULT_WORKERS_TYPES_FILE_NAME } from "./helpers";
import { generateRuntimeTypes } from "./runtime";
import { logRuntimeTypesMessage } from "./runtime/log-runtime-types-message";
import type { Entry } from "../deployment-bundle/entry";
import type { Config, RawEnvironment } from "@cloudflare/workers-utils";

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
				{ telemetryMessage: true }
			);
		}

		const validInterfaceRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;

		if (!validInterfaceRegex.test(args.envInterface)) {
			throw new CommandLineArgsError(
				`The provided env-interface value ("${args.envInterface}") does not satisfy the validation regex: ${validInterfaceRegex}`,
				{
					telemetryMessage:
						"The provided env-interface value does not satisfy the validation regex",
				}
			);
		}

		if (!args.path.endsWith(".d.ts")) {
			throw new CommandLineArgsError(
				`The provided output path '${args.path}' does not point to a declaration file - please use the '.d.ts' extension`,
				{
					telemetryMessage:
						"The provided path does not point to a declaration file",
				}
			);
		}

		checkPath(args.path);

		if (!args.includeEnv && !args.includeRuntime) {
			throw new CommandLineArgsError(
				`You cannot run this command without including either Env or Runtime types`,
				{
					telemetryMessage: true,
				}
			);
		}
	},
	async handler(args) {
		let config: Config;
		const secondaryConfigs: Config[] = [];
		if (Array.isArray(args.config)) {
			config = readConfig({ ...args, config: args.config[0] });
			for (const configPath of args.config.slice(1)) {
				secondaryConfigs.push(readConfig({ config: configPath }));
			}
		} else {
			config = readConfig(args);
		}

		const { envInterface, path: outputPath } = args;

		if (
			!config.configPath ||
			!fs.existsSync(config.configPath) ||
			fs.statSync(config.configPath).isDirectory()
		) {
			throw new UserError(
				`No config file detected${args.config ? ` (at ${args.config})` : ""}. This command requires a Wrangler configuration file.`,
				{ telemetryMessage: "No config file detected" }
			);
		}

		if (args.check) {
			const outOfDate = await checkTypesUpToDate(config, outputPath);
			if (outOfDate) {
				throw new FatalError(
					`Types at ${outputPath} are out of date. Run \`wrangler types\` to regenerate.`,
					1
				);
			}

			logger.log(`✨ Types at ${outputPath} are up to date.\n`);
			return;
		}

		const secondaryEntries: Map<string, Entry> = new Map();

		if (secondaryConfigs.length > 0) {
			for (const secondaryConfig of secondaryConfigs) {
				const serviceEntry = await getEntry({}, secondaryConfig, "types");

				if (serviceEntry.name) {
					const key = serviceEntry.name;
					if (secondaryEntries.has(key)) {
						logger.warn(
							`Configuration file for Worker '${key}' has been passed in more than once using \`--config\`. To remove this warning, only pass each unique Worker config file once.`
						);
					}
					secondaryEntries.set(key, serviceEntry);
					logger.log(
						chalk.dim(
							`- Found Worker '${key}' at '${relative(process.cwd(), serviceEntry.file)}' (${secondaryConfig.configPath})`
						)
					);
				} else {
					throw new UserError(
						`Could not resolve entry point for service config '${secondaryConfig}'.`
					);
				}
			}
		}

		const configContainsEntrypoint =
			config.main !== undefined || !!config.site?.["entry-point"];

		let entrypoint: Entry | undefined;
		if (configContainsEntrypoint) {
			// this will throw if an entrypoint is expected, but doesn't exist
			// e.g. before building. however someone might still want to generate types
			// so we default to module worker
			try {
				entrypoint = await getEntry({}, config, "types");
			} catch {
				entrypoint = undefined;
			}
		}
		const entrypointFormat = entrypoint?.format ?? "modules";

		const header = ["/* eslint-disable */"];
		const content = [];
		if (args.includeEnv) {
			logger.log(`Generating project types...\n`);

			const { envHeader, envTypes } = await generateEnvTypes(
				config,
				args,
				envInterface,
				outputPath,
				entrypoint,
				secondaryEntries
			);
			if (envHeader && envTypes) {
				header.push(envHeader);
				content.push(envTypes);
			}
		}

		if (args.includeRuntime) {
			logger.log("Generating runtime types...\n");
			const { runtimeHeader, runtimeTypes } = await generateRuntimeTypes({
				config,
				outFile: outputPath || undefined,
			});
			header.push(runtimeHeader);
			content.push(`// Begin runtime types\n${runtimeTypes}`);
			logger.log(chalk.dim("Runtime types generated.\n"));
		}

		logHorizontalRule();

		// don't write an empty Env type for service worker syntax
		if ((header.length && content.length) || entrypointFormat === "modules") {
			fs.writeFileSync(
				outputPath,
				`${header.join("\n")}\n${content.join("\n")}`,
				"utf-8"
			);
			logger.log(`✨ Types written to ${outputPath}\n`);
		}
		const tsconfigPath =
			config.tsconfig ?? join(dirname(config.configPath), "tsconfig.json");
		const tsconfigTypes = readTsconfigTypes(tsconfigPath);
		const { mode } = getNodeCompat(
			config.compatibility_date,
			config.compatibility_flags
		);
		if (args.includeRuntime) {
			logRuntimeTypesMessage(tsconfigTypes, mode !== null);
		}
		logger.log(
			`📣 Remember to rerun 'wrangler types' after you change your ${configFileName(config.configPath)} file.\n`
		);
	},
});

/**
 * Check if a string is a valid TypeScript identifier. This is a naive check and doesn't cover all cases
 */
export function isValidIdentifier(key: string) {
	return /^[a-zA-Z_$][\w$]*$/.test(key);
}

/**
 * Construct a type key, if it's not a valid identifier, wrap it in quotes
 */
export function constructTypeKey(key: string) {
	if (isValidIdentifier(key)) {
		return `${key}`;
	}
	return `"${key}"`;
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
	log = true
): Promise<{ envHeader?: string; envTypes?: string }> {
	const stringKeys: string[] = [];
	const secrets = getVarsForDev(
		config.userConfigPath,
		args.envFile,
		// We do not want `getVarsForDev()` to merge in the standard vars into the dev vars
		// because we want to be able to work with secrets differently to vars.
		// So we pass in a fake vars object here.
		{},
		args.env,
		true
	) as Record<string, string>;

	const collectionArgs = {
		...args,
		config: config.configPath,
	} satisfies Partial<(typeof typesCommand)["args"]>;
	const collectedBindings = collectAllBindings(collectionArgs);
	const collectedDurableObjects = collectAllDurableObjects(collectionArgs);
	const collectedServices = collectAllServices(collectionArgs);
	const collectedUnsafeBindings = collectAllUnsafeBindings(collectionArgs);
	const collectedVars = collectAllVars(collectionArgs);
	const collectedWorkflows = collectAllWorkflows(collectionArgs);

	const entrypointFormat = entrypoint?.format ?? "modules";
	const fullOutputPath = resolve(outputPath);

	// Note: we infer whether the user has provided an envInterface by checking
	//       if it is different from the default `Env` value, this works well
	//       besides the fact that the user itself can actually provided `Env` as
	//       an argument... we either need to do this or removing the yargs
	//       default value for envInterface and do `envInterface ?? "Env"`,
	//       for a better UX we chose to go with the yargs default value
	const userProvidedEnvInterface = envInterface !== "Env";

	if (userProvidedEnvInterface && entrypointFormat === "service-worker") {
		throw new Error(
			"An env-interface value has been provided but the worker uses the incompatible Service Worker syntax"
		);
	}

	const envTypeStructure: [string, string][] = [];

	for (const binding of collectedBindings) {
		envTypeStructure.push([constructTypeKey(binding.name), binding.type]);
	}

	if (collectedVars) {
		// Note: vars get overridden by secrets, so should their types
		const vars = Object.entries(collectedVars).filter(
			([key]) => !(key in secrets)
		);
		for (const [varName, varValues] of vars) {
			envTypeStructure.push([
				constructTypeKey(varName),
				varValues.length === 1 ? varValues[0] : varValues.join(" | "),
			]);
			stringKeys.push(varName);
		}
	}

	for (const secretName in secrets) {
		envTypeStructure.push([constructTypeKey(secretName), "string"]);
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
			envTypeStructure.push([
				key,
				`DurableObjectNamespace<import("${importPath}").${durableObject.class_name}>`,
			]);
			continue;
		}

		if (durableObject.script_name) {
			envTypeStructure.push([
				key,
				`DurableObjectNamespace /* ${durableObject.class_name} from ${durableObject.script_name} */`,
			]);
			continue;
		}

		envTypeStructure.push([
			key,
			`DurableObjectNamespace /* ${durableObject.class_name} */`,
		]);
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
			envTypeStructure.push([
				key,
				`Service<typeof import("${importPath}").${service.entrypoint ?? "default"}>`,
			]);
			continue;
		}

		if (service.entrypoint) {
			envTypeStructure.push([
				key,
				`Service /* entrypoint ${service.entrypoint} from ${service.service} */`,
			]);
			continue;
		}

		envTypeStructure.push([key, `Fetcher /* ${service.service} */`]);
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
			envTypeStructure.push([
				key,
				`Workflow<Parameters<import("${importPath}").${workflow.class_name}['run']>[0]['payload']>`,
			]);
			continue;
		}

		if (workflow.script_name) {
			envTypeStructure.push([
				key,
				`Workflow /* ${workflow.class_name} from ${workflow.script_name} */`,
			]);
			continue;
		}

		envTypeStructure.push([key, `Workflow /* ${workflow.class_name} */`]);
	}

	for (const unsafe of collectedUnsafeBindings) {
		if (unsafe.type === "ratelimit") {
			envTypeStructure.push([constructTypeKey(unsafe.name), "RateLimit"]);
			continue;
		}

		envTypeStructure.push([constructTypeKey(unsafe.name), "any"]);
	}

	// Data blobs are not environment-specific
	if (config.data_blobs) {
		for (const dataBlobs in config.data_blobs) {
			envTypeStructure.push([constructTypeKey(dataBlobs), "ArrayBuffer"]);
		}
	}

	// Text blobs are not environment-specific
	if (config.text_blobs) {
		for (const textBlobs in config.text_blobs) {
			envTypeStructure.push([constructTypeKey(textBlobs), "string"]);
		}
	}

	const modulesTypeStructure: string[] = [];
	if (config.rules) {
		const moduleTypeMap = {
			Text: "string",
			Data: "ArrayBuffer",
			CompiledWasm: "WebAssembly.Module",
		};
		for (const ruleObject of config.rules) {
			const typeScriptType =
				moduleTypeMap[ruleObject.type as keyof typeof moduleTypeMap];
			if (typeScriptType !== undefined) {
				ruleObject.globs.forEach((glob) => {
					modulesTypeStructure.push(`declare module "${constructTSModuleGlob(glob)}" {
	const value: ${typeScriptType};
	export default value;
}`);
				});
			}
		}
	}

	const wranglerCommandUsed = ["wrangler", ...process.argv.slice(2)].join(" ");

	const typesHaveBeenFound =
		envTypeStructure.length || modulesTypeStructure.length;
	if (entrypointFormat === "modules" || typesHaveBeenFound) {
		const { fileContent, consoleOutput } = generateTypeStrings(
			entrypointFormat,
			envInterface,
			envTypeStructure.map(([key, value]) => `${key}: ${value};`),
			modulesTypeStructure,
			stringKeys,
			config.compatibility_date,
			config.compatibility_flags,
			entrypoint
				? generateImportSpecifier(fullOutputPath, entrypoint.file)
				: undefined,
			[...getDurableObjectClassNameToUseSQLiteMap(config.migrations).keys()]
		);
		const hash = createHash("sha256")
			.update(consoleOutput)
			.digest("hex")
			.slice(0, 32);

		const envHeader = `// Generated by Wrangler by running \`${wranglerCommandUsed}\` (hash: ${hash})`;

		if (log) {
			logger.log(chalk.dim(consoleOutput));
		}

		return { envHeader, envTypes: fileContent };
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

const checkPath = (path: string) => {
	const wranglerOverrideDTSPath = findUpSync(path);
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
				{ telemetryMessage: "A non-Wrangler .d.ts file already exists" }
			);
		}
	} catch (error) {
		if (error instanceof Error && !error.message.includes("not found")) {
			throw error;
		}
	}
};

function generateTypeStrings(
	formatType: string,
	envInterface: string,
	envTypeStructure: string[],
	modulesTypeStructure: string[],
	stringKeys: string[],
	compatibilityDate: string | undefined,
	compatibilityFlags: string[] | undefined,
	entrypointModule: string | undefined,
	configuredDurableObjects: string[]
): { fileContent: string; consoleOutput: string } {
	let baseContent = "";
	let processEnv = "";

	if (formatType === "modules") {
		if (
			isProcessEnvPopulated(compatibilityDate, compatibilityFlags) &&
			stringKeys.length > 0
		) {
			// StringifyValues ensures that json vars are correctly types as strings, not objects on process.env
			processEnv = `\ntype StringifyValues<EnvType extends Record<string, unknown>> = {\n\t[Binding in keyof EnvType]: EnvType[Binding] extends string ? EnvType[Binding] : string;\n};\ndeclare namespace NodeJS {\n\tinterface ProcessEnv extends StringifyValues<Pick<Cloudflare.Env, ${stringKeys.map((k) => `"${k}"`).join(" | ")}>> {}\n}`;
		}
		baseContent = `declare namespace Cloudflare {${entrypointModule ? `\n\tinterface GlobalProps {\n\t\tmainModule: typeof import("${entrypointModule}");${configuredDurableObjects.length > 0 ? `\n\t\tdurableNamespaces: ${configuredDurableObjects.map((d) => `"${d}"`).join(" | ")};` : ""}\n\t}` : ""}\n\tinterface Env {${envTypeStructure.map((value) => `\n\t\t${value}`).join("")}\n\t}\n}\ninterface ${envInterface} extends Cloudflare.Env {}${processEnv}`;
	} else {
		baseContent = `export {};\ndeclare global {\n${envTypeStructure.map((value) => `\tconst ${value}`).join("\n")}\n}`;
	}

	const modulesContent = modulesTypeStructure.join("\n");

	return {
		fileContent: `${baseContent}\n${modulesContent}`,
		consoleOutput: `${baseContent}\n${modulesContent}`,
	};
}

/**
 * Attempts to read the tsconfig.json at the current path.
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
			`Environment "${environmentName}" not found in configuration.\n${envList}`
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
 * e.g.
 * 		`[1, 2, 3]` returns `number[]`,
 * 		`[1, 2, 'three']` returns `(number|string)[]`,
 * 		`['false', true]` returns `(string|boolean)[]`,
 *
 * @param array the target array
 * @returns a string representing the types of such array
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
 * Collects all bindings across environments defined in the config file
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
function collectAllBindings(
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
						`Please use unique binding names for different binding types.`
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

		for (const kv of env.kv_namespaces ?? []) {
			addBinding(kv.binding, "KVNamespace", "kv_namespaces", envName);
		}

		for (const r2 of env.r2_buckets ?? []) {
			addBinding(r2.binding, "R2Bucket", "r2_buckets", envName);
		}

		for (const d1 of env.d1_databases ?? []) {
			addBinding(d1.binding, "D1Database", "d1_databases", envName);
		}

		for (const vectorize of env.vectorize ?? []) {
			addBinding(vectorize.binding, "VectorizeIndex", "vectorize", envName);
		}

		for (const hyperdrive of env.hyperdrive ?? []) {
			addBinding(hyperdrive.binding, "Hyperdrive", "hyperdrive", envName);
		}

		for (const sendEmail of env.send_email ?? []) {
			addBinding(sendEmail.name, "SendEmail", "send_email", envName);
		}

		for (const ae of env.analytics_engine_datasets ?? []) {
			addBinding(
				ae.binding,
				"AnalyticsEngineDataset",
				"analytics_engine_datasets",
				envName
			);
		}

		for (const dispatch of env.dispatch_namespaces ?? []) {
			addBinding(
				dispatch.binding,
				"DispatchNamespace",
				"dispatch_namespaces",
				envName
			);
		}

		for (const mtls of env.mtls_certificates ?? []) {
			addBinding(mtls.binding, "Fetcher", "mtls_certificates", envName);
		}

		for (const queue of env.queues?.producers ?? []) {
			addBinding(queue.binding, "Queue", "queues_producers", envName);
		}

		for (const secret of env.secrets_store_secrets ?? []) {
			addBinding(
				secret.binding,
				"SecretsStoreSecret",
				"secrets_store_secrets",
				envName
			);
		}

		for (const helloWorld of env.unsafe_hello_world ?? []) {
			addBinding(
				helloWorld.binding,
				"HelloWorldBinding",
				"unsafe_hello_world",
				envName
			);
		}

		for (const ratelimit of env.ratelimits ?? []) {
			addBinding(ratelimit.name, "RateLimit", "ratelimits", envName);
		}

		for (const workerLoader of env.worker_loaders ?? []) {
			addBinding(
				workerLoader.binding,
				"WorkerLoader",
				"worker_loaders",
				envName
			);
		}

		for (const vpcService of env.vpc_services ?? []) {
			addBinding(vpcService.binding, "Fetcher", "vpc_services", envName);
		}

		for (const pipeline of env.pipelines ?? []) {
			addBinding(
				pipeline.binding,
				'import("cloudflare:pipelines").Pipeline<import("cloudflare:pipelines").PipelineRecord>',
				"pipelines",
				envName
			);
		}

		if (env.logfwdr?.bindings?.length) {
			addBinding("LOGFWDR_SCHEMA", "any", "logfwdr", envName);
		}

		if (env.browser) {
			addBinding(env.browser.binding, "Fetcher", "browser", envName);
		}

		if (env.ai) {
			addBinding(env.ai.binding, "Ai", "ai", envName);
		}

		if (env.images) {
			addBinding(env.images.binding, "ImagesBinding", "images", envName);
		}

		if (env.media) {
			addBinding(env.media.binding, "MediaBinding", "media", envName);
		}

		if (env.version_metadata) {
			addBinding(
				env.version_metadata.binding,
				"WorkerVersionMetadata",
				"version_metadata",
				envName
			);
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
		collectEnvironmentBindings(rawConfig, "top-level");
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

	function collectEnvironmentDOs(env: RawEnvironment | undefined) {
		if (!env?.durable_objects?.bindings) {
			return;
		}

		for (const doBinding of env.durable_objects.bindings) {
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
		collectEnvironmentDOs(envConfig);
	} else {
		collectEnvironmentDOs(rawConfig);
		for (const env of Object.values(rawConfig.env ?? {})) {
			collectEnvironmentDOs(env);
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

	function collectEnvironmentServices(env: RawEnvironment | undefined) {
		if (!env?.services) {
			return;
		}

		for (const service of env.services) {
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
		collectEnvironmentServices(envConfig);
	} else {
		collectEnvironmentServices(rawConfig);
		for (const env of Object.values(rawConfig.env ?? {})) {
			collectEnvironmentServices(env);
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

	function collectEnvironmentWorkflows(env: RawEnvironment | undefined) {
		if (!env?.workflows) {
			return;
		}

		for (const workflow of env.workflows) {
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
		collectEnvironmentWorkflows(envConfig);
	} else {
		collectEnvironmentWorkflows(rawConfig);
		for (const env of Object.values(rawConfig.env ?? {})) {
			collectEnvironmentWorkflows(env);
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

	function collectEnvironmentUnsafe(env: RawEnvironment | undefined) {
		if (!env?.unsafe?.bindings) {
			return;
		}

		for (const binding of env.unsafe.bindings) {
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
		collectEnvironmentUnsafe(envConfig);
	} else {
		collectEnvironmentUnsafe(rawConfig);
		for (const env of Object.values(rawConfig.env ?? {})) {
			collectEnvironmentUnsafe(env);
		}
	}

	return Array.from(unsafeMap.values());
}

const logHorizontalRule = () => {
	const screenWidth = process.stdout.columns;
	logger.log(chalk.dim("─".repeat(Math.min(screenWidth, 60))));
};
