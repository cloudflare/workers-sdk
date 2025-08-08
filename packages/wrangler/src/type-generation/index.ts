import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import chalk from "chalk";
import { findUpSync } from "find-up";
import { getNodeCompat } from "miniflare";
import {
	configFileName,
	experimental_readRawConfig,
	readConfig,
} from "../config";
import { createCommand } from "../core/create-command";
import { getEntry } from "../deployment-bundle/entry";
import { getVarsForDev } from "../dev/dev-vars";
import { CommandLineArgsError, UserError } from "../errors";
import { logger } from "../logger";
import { parseJSONC } from "../parse";
import { isProcessEnvPopulated } from "../process-env";
import { generateRuntimeTypes } from "./runtime";
import { logRuntimeTypesMessage } from "./runtime/log-runtime-types-message";
import type { Config, RawEnvironment } from "../config";
import type { Entry } from "../deployment-bundle/entry";

export const typesCommand = createCommand({
	metadata: {
		description: "📝 Generate types from your Worker configuration\n",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		epilogue:
			"📖 Learn more at https://developers.cloudflare.com/workers/languages/typescript/#generate-types",
	},
	behaviour: {
		provideConfig: false,
	},
	positionalArgs: ["path"],
	args: {
		path: {
			describe: "The path to the declaration file for the generated types",
			type: "string",
			default: "worker-configuration.d.ts",
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

type Secrets = Record<string, string>;

type ConfigToDTS = Partial<Omit<Config, "vars">> & { vars: VarTypes } & {
	secrets: Secrets;
};

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

	const configToDTS: ConfigToDTS = {
		kv_namespaces: config.kv_namespaces ?? [],
		vars: collectAllVars({ ...args, config: config.configPath }),
		wasm_modules: config.wasm_modules,
		text_blobs: {
			...config.text_blobs,
		},
		data_blobs: config.data_blobs,
		durable_objects: config.durable_objects,
		r2_buckets: config.r2_buckets,
		d1_databases: config.d1_databases,
		services: config.services,
		analytics_engine_datasets: config.analytics_engine_datasets,
		dispatch_namespaces: config.dispatch_namespaces,
		logfwdr: config.logfwdr,
		unsafe: config.unsafe,
		rules: config.rules,
		queues: config.queues,
		send_email: config.send_email,
		vectorize: config.vectorize,
		hyperdrive: config.hyperdrive,
		mtls_certificates: config.mtls_certificates,
		browser: config.browser,
		images: config.images,
		ai: config.ai,
		version_metadata: config.version_metadata,
		secrets,
		assets: config.assets,
		workflows: config.workflows,
		pipelines: config.pipelines,
		secrets_store_secrets: config.secrets_store_secrets,
		unsafe_hello_world: config.unsafe_hello_world,
	};

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

	if (configToDTS.kv_namespaces) {
		for (const kvNamespace of configToDTS.kv_namespaces) {
			envTypeStructure.push([
				constructTypeKey(kvNamespace.binding),
				"KVNamespace",
			]);
		}
	}

	if (configToDTS.vars) {
		// Note: vars get overridden by secrets, so should their types
		const vars = Object.entries(configToDTS.vars).filter(
			([key]) => !(key in configToDTS.secrets)
		);
		for (const [varName, varValues] of vars) {
			envTypeStructure.push([
				constructTypeKey(varName),
				varValues.length === 1 ? varValues[0] : varValues.join(" | "),
			]);
			stringKeys.push(varName);
		}
	}

	for (const secretName in configToDTS.secrets) {
		envTypeStructure.push([constructTypeKey(secretName), "string"]);
		stringKeys.push(secretName);
	}

	if (configToDTS.durable_objects?.bindings) {
		for (const durableObject of configToDTS.durable_objects.bindings) {
			const doEntrypoint = durableObject.script_name
				? serviceEntries?.get(durableObject.script_name)
				: entrypoint;

			const importPath = doEntrypoint
				? generateImportSpecifier(fullOutputPath, doEntrypoint.file)
				: undefined;

			const exportExists = doEntrypoint?.exports?.some(
				(e) => e === durableObject.class_name
			);

			let typeName: string;

			if (importPath && exportExists) {
				typeName = `DurableObjectNamespace<import("${importPath}").${durableObject.class_name}>`;
			} else if (durableObject.script_name) {
				typeName = `DurableObjectNamespace /* ${durableObject.class_name} from ${durableObject.script_name} */`;
			} else {
				typeName = `DurableObjectNamespace /* ${durableObject.class_name} */`;
			}

			envTypeStructure.push([constructTypeKey(durableObject.name), typeName]);
		}
	}

	if (configToDTS.r2_buckets) {
		for (const R2Bucket of configToDTS.r2_buckets) {
			envTypeStructure.push([constructTypeKey(R2Bucket.binding), "R2Bucket"]);
		}
	}

	if (configToDTS.d1_databases) {
		for (const d1 of configToDTS.d1_databases) {
			envTypeStructure.push([constructTypeKey(d1.binding), "D1Database"]);
		}
	}

	if (configToDTS.secrets_store_secrets) {
		for (const secretsStoreSecret of configToDTS.secrets_store_secrets) {
			envTypeStructure.push([
				constructTypeKey(secretsStoreSecret.binding),
				"SecretsStoreSecret",
			]);
		}
	}

	if (configToDTS.unsafe_hello_world) {
		for (const helloWorld of configToDTS.unsafe_hello_world) {
			envTypeStructure.push([
				constructTypeKey(helloWorld.binding),
				"HelloWorldBinding",
			]);
		}
	}

	if (configToDTS.services) {
		for (const service of configToDTS.services) {
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

			let typeName: string;

			if (importPath && exportExists) {
				typeName = `Service<typeof import("${importPath}").${service.entrypoint ?? "default"}>`;
			} else if (service.entrypoint) {
				typeName = `Service /* entrypoint ${service.entrypoint} from ${service.service} */`;
			} else {
				typeName = `Fetcher /* ${service.service} */`;
			}

			envTypeStructure.push([constructTypeKey(service.binding), typeName]);
		}
	}

	if (configToDTS.analytics_engine_datasets) {
		for (const analyticsEngine of configToDTS.analytics_engine_datasets) {
			envTypeStructure.push([
				constructTypeKey(analyticsEngine.binding),
				"AnalyticsEngineDataset",
			]);
		}
	}

	if (configToDTS.dispatch_namespaces) {
		for (const namespace of configToDTS.dispatch_namespaces) {
			envTypeStructure.push([
				constructTypeKey(namespace.binding),
				"DispatchNamespace",
			]);
		}
	}

	if (configToDTS.logfwdr?.bindings?.length) {
		envTypeStructure.push([constructTypeKey("LOGFWDR_SCHEMA"), "any"]);
	}

	if (configToDTS.data_blobs) {
		for (const dataBlobs in configToDTS.data_blobs) {
			envTypeStructure.push([constructTypeKey(dataBlobs), "ArrayBuffer"]);
		}
	}

	if (configToDTS.text_blobs) {
		for (const textBlobs in configToDTS.text_blobs) {
			envTypeStructure.push([constructTypeKey(textBlobs), "string"]);
		}
	}

	if (configToDTS.unsafe?.bindings) {
		for (const unsafe of configToDTS.unsafe.bindings) {
			if (unsafe.type === "ratelimit") {
				envTypeStructure.push([constructTypeKey(unsafe.name), "RateLimit"]);
			} else {
				envTypeStructure.push([constructTypeKey(unsafe.name), "any"]);
			}
		}
	}

	if (configToDTS.queues) {
		if (configToDTS.queues.producers) {
			for (const queue of configToDTS.queues.producers) {
				envTypeStructure.push([constructTypeKey(queue.binding), "Queue"]);
			}
		}
	}

	if (configToDTS.send_email) {
		for (const sendEmail of configToDTS.send_email) {
			envTypeStructure.push([constructTypeKey(sendEmail.name), "SendEmail"]);
		}
	}

	if (configToDTS.vectorize) {
		for (const vectorize of configToDTS.vectorize) {
			envTypeStructure.push([
				constructTypeKey(vectorize.binding),
				"VectorizeIndex",
			]);
		}
	}

	if (configToDTS.hyperdrive) {
		for (const hyperdrive of configToDTS.hyperdrive) {
			envTypeStructure.push([
				constructTypeKey(hyperdrive.binding),
				"Hyperdrive",
			]);
		}
	}

	if (configToDTS.mtls_certificates) {
		for (const mtlsCertificate of configToDTS.mtls_certificates) {
			envTypeStructure.push([
				constructTypeKey(mtlsCertificate.binding),
				"Fetcher",
			]);
		}
	}

	if (configToDTS.browser) {
		// The BrowserWorker type in @cloudflare/puppeteer is of type
		// { fetch: typeof fetch }, but workers-types doesn't include it
		// and Fetcher is valid for the purposes of handing it to puppeteer
		envTypeStructure.push([
			constructTypeKey(configToDTS.browser.binding),
			"Fetcher",
		]);
	}

	if (configToDTS.ai) {
		envTypeStructure.push([constructTypeKey(configToDTS.ai.binding), "Ai"]);
	}

	if (configToDTS.images) {
		envTypeStructure.push([
			constructTypeKey(configToDTS.images.binding),
			"ImagesBinding",
		]);
	}

	if (configToDTS.version_metadata) {
		envTypeStructure.push([
			configToDTS.version_metadata.binding,
			"WorkerVersionMetadata",
		]);
	}

	if (configToDTS.assets?.binding) {
		envTypeStructure.push([
			constructTypeKey(configToDTS.assets.binding),
			"Fetcher",
		]);
	}

	if (configToDTS.workflows) {
		for (const workflow of configToDTS.workflows) {
			envTypeStructure.push([constructTypeKey(workflow.binding), "Workflow"]);
		}
	}

	if (configToDTS.pipelines) {
		for (const pipeline of configToDTS.pipelines) {
			envTypeStructure.push([
				constructTypeKey(pipeline.binding),
				`import("cloudflare:pipelines").Pipeline<import("cloudflare:pipelines").PipelineRecord>`,
			]);
		}
	}

	const modulesTypeStructure: string[] = [];
	if (configToDTS.rules) {
		const moduleTypeMap = {
			Text: "string",
			Data: "ArrayBuffer",
			CompiledWasm: "WebAssembly.Module",
		};
		for (const ruleObject of configToDTS.rules) {
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
			config.compatibility_flags
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
	compatibilityFlags: string[] | undefined
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
		baseContent = `declare namespace Cloudflare {\n\tinterface Env {${envTypeStructure.map((value) => `\n\t\t${value}`).join("")}\n\t}\n}\ninterface ${envInterface} extends Cloudflare.Env {}${processEnv}`;
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

type VarTypes = Record<string, string[]>;

/**
 * Collects all the vars types across all the environments defined in the config file
 *
 * @param args all the CLI arguments passed to the `types` command
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

			if (typeof value === "number" || typeof value === "boolean") {
				varsInfo[key].add(`${value}`);
				return;
			}
			if (typeof value === "string" || typeof value === "object") {
				varsInfo[key].add(JSON.stringify(value));
				return;
			}

			// let's fallback to a safe `unknown` if we couldn't detect the type
			varsInfo[key].add("unknown");
		});
	}

	const { rawConfig } = experimental_readRawConfig(args);
	collectEnvironmentVars(rawConfig.vars);
	Object.entries(rawConfig.env ?? {}).forEach(([_envName, env]) => {
		collectEnvironmentVars(env.vars);
	});

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

const logHorizontalRule = () => {
	const screenWidth = process.stdout.columns;
	logger.log(chalk.dim("─".repeat(Math.min(screenWidth, 60))));
};
