import { createHash } from "node:crypto";
import { basename, dirname, extname, relative, resolve } from "node:path";
import {
	experimental_readRawConfig,
	UserError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import { getDurableObjectClassNameToUseSQLiteMap } from "../../dev/class-names-sqlite";
import { getVarsForDev } from "../../dev/dev-vars";
import { logger } from "../../logger";
import { isProcessEnvPopulated } from "../../process-env";
import {
	escapeTypeScriptString,
	getEnvHeader,
	isValidIdentifier,
	toEnvInterfaceName,
	TOP_LEVEL_ENV_NAME,
	validateEnvInterfaceNames,
} from "../helpers";
import { fetchPipelineTypes } from "../pipeline-schema";
import {
	collectAllDurableObjects,
	collectAllPipelines,
	collectAllServices,
	collectAllUnsafeBindings,
	collectAllVars,
	collectAllWorkflows,
	collectCoreBindings,
} from "./binding-collectors";
import {
	collectCoreBindingsPerEnvironment,
	collectDurableObjectsPerEnvironment,
	collectPipelinesPerEnvironment,
	collectServicesPerEnvironment,
	collectUnsafeBindingsPerEnvironment,
	collectVarsPerEnvironment,
	collectWorkflowsPerEnvironment,
} from "./per-env-collectors";
import type { Entry } from "../../deployment-bundle/entry";
import type { typesCommand } from "../index";
import type { Config } from "@cloudflare/workers-utils";

/**
 * Logs a horizontal rule to the console
 */
export const logHorizontalRule = () => {
	const screenWidth = process.stdout.columns;
	logger.log(chalk.dim("─".repeat(Math.min(screenWidth, 60))));
};

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
	// Get secret vars from .dev.vars/.env files for type generation.
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
	const secrets: Record<string, string> = {};
	for (const key of Object.keys(secretBindings)) {
		secrets[key] = "";
	}

	const collectionArgs = {
		...args,
		config: config.configPath,
	} satisfies Partial<(typeof typesCommand)["args"]>;

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
			"An env-interface value has been provided but the worker uses the incompatible Service Worker syntax"
		);
	}

	const { rawConfig } = experimental_readRawConfig(collectionArgs);
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
			envHeader: getEnvHeader(hash),
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
 * @param secrets - Record of secret variable names to their values
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
			if (varName in secrets) {
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

		for (const secretName in secrets) {
			envBindings.push({ key: constructTypeKey(secretName), value: "string" });
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

	const topLevelVars = varsPerEnv.get(TOP_LEVEL_ENV_NAME) ?? {};
	for (const [varName, varValues] of Object.entries(topLevelVars)) {
		if (varName in secrets) {
			continue;
		}

		const varType =
			varValues.length === 1 ? varValues[0] : varValues.join(" | ");
		trackBinding(varName, varType, TOP_LEVEL_ENV_NAME);
		if (!stringKeys.includes(varName)) {
			stringKeys.push(varName);
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

	for (const secretName in secrets) {
		aggregatedEnvBindings.push({
			key: constructTypeKey(secretName),
			required: true,
			type: "string",
		});
	}

	for (const [name, types] of aggregatedBindings.entries()) {
		if (name in secrets) {
			continue;
		}

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
		envHeader: getEnvHeader(hash),
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
