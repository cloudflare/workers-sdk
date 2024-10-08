import * as fs from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import * as esmLexer from "es-module-lexer";
import { findUpSync } from "find-up";
import { getNodeCompat } from "miniflare";
import { findWranglerToml, readConfig } from "../config";
import { getEntry } from "../deployment-bundle/entry";
import { getVarsForDev } from "../dev/dev-vars";
import { UserError } from "../errors";
import { CommandLineArgsError } from "../index";
import { logger } from "../logger";
import { parseJSONC } from "../parse";
import { printWranglerBanner } from "../update-check";
import { generateRuntimeTypes } from "./runtime";
import { logRuntimeTypesMessage } from "./runtime/log-runtime-types-message";
import type { Config } from "../config";
import type { CfScriptFormat } from "../deployment-bundle/worker";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function typesOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("path", {
			describe: "The path to the declaration file to generate",
			type: "string",
			default: "worker-configuration.d.ts",
			demandOption: false,
		})
		.option("env-interface", {
			type: "string",
			default: "Env",
			describe: "The name of the generated environment interface",
			requiresArg: true,
		})
		.option("experimental-include-runtime", {
			alias: "x-include-runtime",
			type: "string",
			describe: "The path of the generated runtime types file",
			demandOption: false,
		});
}

export async function typesHandler(
	args: StrictYargsOptionsToInterface<typeof typesOptions>
) {
	const { envInterface, path: outputPath } = args;

	const validInterfaceRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;

	if (!validInterfaceRegex.test(envInterface)) {
		throw new CommandLineArgsError(
			`The provided env-interface value ("${envInterface}") does not satisfy the validation regex: ${validInterfaceRegex}`
		);
	}

	if (!outputPath.endsWith(".d.ts")) {
		throw new CommandLineArgsError(
			`The provided path value ("${outputPath}") does not point to a declaration file (please use the 'd.ts' extension)`
		);
	}

	await printWranglerBanner();

	const configPath =
		args.config ?? findWranglerToml(process.cwd(), args.experimentalJsonConfig);
	if (
		!configPath ||
		!fs.existsSync(configPath) ||
		fs.statSync(configPath).isDirectory()
	) {
		logger.warn(
			`No config file detected${
				args.config ? ` (at ${args.config})` : ""
			}, aborting`
		);
		return;
	}

	const config = readConfig(configPath, args);

	// args.xRuntime will be a string if the user passes "--x-include-runtime" or "--x-include-runtime=..."
	if (typeof args.experimentalIncludeRuntime === "string") {
		logger.log(`Generating runtime types...`);

		const { outFile } = await generateRuntimeTypes({
			config,
			outFile: args.experimentalIncludeRuntime || undefined,
		});

		const tsconfigPath =
			config.tsconfig ?? join(dirname(configPath), "tsconfig.json");
		const tsconfigTypes = readTsconfigTypes(tsconfigPath);
		const { mode } = getNodeCompat(
			config.compatibility_date,
			config.compatibility_flags,
			{
				nodeCompat: config.node_compat,
			}
		);

		logRuntimeTypesMessage(outFile, tsconfigTypes, mode !== null);
	}

	const secrets = getVarsForDev(
		{ configPath, vars: {} },
		args.env,
		true
	) as Record<string, string>;

	const configBindingsWithSecrets: Partial<Config> & {
		secrets: Record<string, string>;
	} = {
		kv_namespaces: config.kv_namespaces ?? [],
		vars: { ...config.vars },
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
		ai: config.ai,
		version_metadata: config.version_metadata,
		secrets,
		assets: config.assets,
	};

	await generateTypes(
		configBindingsWithSecrets,
		config,
		envInterface,
		outputPath
	);
}

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
 * Construct a full type definition for a key-value pair
 * If useRawVal is true, we'll use the value as the type, otherwise we'll format it for a string definition
 */
export function constructType(
	key: string,
	value: string | number | boolean,
	useRawVal = true
) {
	const typeKey = constructTypeKey(key);
	if (typeof value === "string") {
		if (useRawVal) {
			return `${typeKey}: ${value};`;
		}
		return `${typeKey}: ${JSON.stringify(value)};`;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return `${typeKey}: ${value};`;
	}
	return `${typeKey}: unknown;`;
}

type Secrets = Record<string, string>;

async function generateTypes(
	configToDTS: Partial<Config> & { secrets: Secrets },
	config: Config,
	envInterface: string,
	outputPath: string
) {
	const configContainsEntrypoint =
		config.main !== undefined || !!config.site?.["entry-point"];

	const entrypoint = configContainsEntrypoint
		? await getEntry({}, config, "types")
		: undefined;

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

	const envTypeStructure: string[] = [];

	if (configToDTS.kv_namespaces) {
		for (const kvNamespace of configToDTS.kv_namespaces) {
			envTypeStructure.push(constructType(kvNamespace.binding, "KVNamespace"));
		}
	}

	if (configToDTS.vars) {
		// Note: vars get overridden by secrets, so should their types
		const vars = Object.entries(configToDTS.vars).filter(
			([key]) => !(key in configToDTS.secrets)
		);
		for (const [varName, varValue] of vars) {
			if (
				typeof varValue === "string" ||
				typeof varValue === "number" ||
				typeof varValue === "boolean"
			) {
				envTypeStructure.push(constructType(varName, varValue, false));
			}
			if (typeof varValue === "object" && varValue !== null) {
				envTypeStructure.push(
					constructType(varName, JSON.stringify(varValue), true)
				);
			}
		}
	}

	for (const secretName in configToDTS.secrets) {
		envTypeStructure.push(constructType(secretName, "string", true));
	}

	if (configToDTS.durable_objects?.bindings) {
		const importPath = entrypoint
			? generateImportSpecifier(fullOutputPath, entrypoint.file)
			: undefined;

		await esmLexer.init;
		const entrypointExports = entrypoint
			? esmLexer.parse(fs.readFileSync(entrypoint.file, "utf-8"))[1]
			: undefined;

		for (const durableObject of configToDTS.durable_objects.bindings) {
			const exportExists = entrypointExports?.some(
				(e) => e.n === durableObject.class_name
			);

			let typeName: string;
			// Import the type if it's exported and it's not an external worker
			if (importPath && exportExists && !durableObject.script_name) {
				typeName = `DurableObjectNamespace<import("${importPath}").${durableObject.class_name}>`;
			} else if (durableObject.script_name) {
				typeName = `DurableObjectNamespace /* ${durableObject.class_name} from ${durableObject.script_name} */`;
			} else {
				typeName = `DurableObjectNamespace /* ${durableObject.class_name} */`;
			}

			envTypeStructure.push(constructType(durableObject.name, typeName));
		}
	}

	if (configToDTS.r2_buckets) {
		for (const R2Bucket of configToDTS.r2_buckets) {
			envTypeStructure.push(constructType(R2Bucket.binding, "R2Bucket"));
		}
	}

	if (configToDTS.d1_databases) {
		for (const d1 of configToDTS.d1_databases) {
			envTypeStructure.push(constructType(d1.binding, "D1Database"));
		}
	}

	if (configToDTS.services) {
		for (const service of configToDTS.services) {
			envTypeStructure.push(constructType(service.binding, "Fetcher"));
		}
	}

	if (configToDTS.analytics_engine_datasets) {
		for (const analyticsEngine of configToDTS.analytics_engine_datasets) {
			envTypeStructure.push(
				constructType(analyticsEngine.binding, "AnalyticsEngineDataset")
			);
		}
	}

	if (configToDTS.dispatch_namespaces) {
		for (const namespace of configToDTS.dispatch_namespaces) {
			envTypeStructure.push(
				constructType(namespace.binding, "DispatchNamespace")
			);
		}
	}

	if (configToDTS.logfwdr?.bindings?.length) {
		envTypeStructure.push(constructType("LOGFWDR_SCHEMA", "any"));
	}

	if (configToDTS.data_blobs) {
		for (const dataBlobs in configToDTS.data_blobs) {
			envTypeStructure.push(constructType(dataBlobs, "ArrayBuffer"));
		}
	}

	if (configToDTS.text_blobs) {
		for (const textBlobs in configToDTS.text_blobs) {
			envTypeStructure.push(constructType(textBlobs, "string"));
		}
	}

	if (configToDTS.unsafe?.bindings) {
		for (const unsafe of configToDTS.unsafe.bindings) {
			if (unsafe.type === "ratelimit") {
				envTypeStructure.push(constructType(unsafe.name, "RateLimit"));
			} else {
				envTypeStructure.push(constructType(unsafe.name, "any"));
			}
		}
	}

	if (configToDTS.queues) {
		if (configToDTS.queues.producers) {
			for (const queue of configToDTS.queues.producers) {
				envTypeStructure.push(constructType(queue.binding, "Queue"));
			}
		}
	}

	if (configToDTS.send_email) {
		for (const sendEmail of configToDTS.send_email) {
			envTypeStructure.push(constructType(sendEmail.name, "SendEmail"));
		}
	}

	if (configToDTS.vectorize) {
		for (const vectorize of configToDTS.vectorize) {
			envTypeStructure.push(constructType(vectorize.binding, "VectorizeIndex"));
		}
	}

	if (configToDTS.hyperdrive) {
		for (const hyperdrive of configToDTS.hyperdrive) {
			envTypeStructure.push(constructType(hyperdrive.binding, "Hyperdrive"));
		}
	}

	if (configToDTS.mtls_certificates) {
		for (const mtlsCertificate of configToDTS.mtls_certificates) {
			envTypeStructure.push(constructType(mtlsCertificate.binding, "Fetcher"));
		}
	}

	if (configToDTS.browser) {
		// The BrowserWorker type in @cloudflare/puppeteer is of type
		// { fetch: typeof fetch }, but workers-types doesn't include it
		// and Fetcher is valid for the purposes of handing it to puppeteer
		envTypeStructure.push(
			constructType(configToDTS.browser.binding, "Fetcher")
		);
	}

	if (configToDTS.ai) {
		envTypeStructure.push(constructType(configToDTS.ai.binding, "Ai"));
	}

	if (configToDTS.version_metadata) {
		envTypeStructure.push(
			`${configToDTS.version_metadata.binding}: { id: string; tag: string };`
		);
	}

	if (configToDTS.assets?.binding) {
		envTypeStructure.push(constructType(configToDTS.assets.binding, "Fetcher"));
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

	writeDTSFile({
		envTypeStructure,
		modulesTypeStructure,
		formatType: entrypointFormat,
		envInterface,
		path: fullOutputPath,
	});
}

function writeDTSFile({
	envTypeStructure,
	modulesTypeStructure,
	formatType,
	envInterface,
	path,
}: {
	envTypeStructure: string[];
	modulesTypeStructure: string[];
	formatType: CfScriptFormat;
	envInterface: string;
	path: string;
}) {
	const wranglerOverrideDTSPath = findUpSync(path);
	try {
		if (
			wranglerOverrideDTSPath !== undefined &&
			!fs
				.readFileSync(wranglerOverrideDTSPath, "utf8")
				.includes("Generated by Wrangler")
		) {
			throw new UserError(
				`A non-wrangler ${basename(path)} already exists, please rename and try again.`
			);
		}
	} catch (error) {
		if (error instanceof Error && !error.message.includes("not found")) {
			throw error;
		}
	}

	const wranglerCommandUsed = ["wrangler", ...process.argv.slice(2)].join(" ");

	const typesHaveBeenFound =
		envTypeStructure.length || modulesTypeStructure.length;

	if (formatType === "modules" || typesHaveBeenFound) {
		const { fileContent, consoleOutput } = generateTypeStrings(
			formatType,
			envInterface,
			envTypeStructure,
			modulesTypeStructure
		);

		fs.writeFileSync(
			path,
			[
				`// Generated by Wrangler by running \`${wranglerCommandUsed}\``,
				"",
				fileContent,
			].join("\n")
		);

		logger.log(`Generating project types...\n`);
		logger.log(consoleOutput);
	}
}

function generateTypeStrings(
	formatType: string,
	envInterface: string,
	envTypeStructure: string[],
	modulesTypeStructure: string[]
): { fileContent: string; consoleOutput: string } {
	let baseContent = "";
	let eslintDisable = "";

	if (formatType === "modules") {
		if (envTypeStructure.length === 0) {
			eslintDisable =
				"// eslint-disable-next-line @typescript-eslint/no-empty-interface,@typescript-eslint/no-empty-object-type\n";
		}
		baseContent = `interface ${envInterface} {${envTypeStructure.map((value) => `\n\t${value}`).join("")}\n}`;
	} else {
		baseContent = `export {};\ndeclare global {\n${envTypeStructure.map((value) => `\tconst ${value}`).join("\n")}\n}`;
	}

	const modulesContent = modulesTypeStructure.join("\n");

	return {
		fileContent: `${eslintDisable}${baseContent}\n${modulesContent}`,
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
		const tsconfig = parseJSONC<TSConfig>(
			fs.readFileSync(tsconfigPath, "utf-8")
		);
		return tsconfig.compilerOptions?.types || [];
	} catch (e) {
		return [];
	}
}

type TSConfig = {
	compilerOptions: {
		types: string[];
	};
};
