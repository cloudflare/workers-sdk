import * as fs from "node:fs";
import { findUpSync } from "find-up";
import { findWranglerToml, readConfig } from "./config";
import { getEntry } from "./deployment-bundle/entry";
import { getVarsForDev } from "./dev/dev-vars";
import { UserError } from "./errors";
import { logger } from "./logger";
import { printWranglerBanner } from "./update-check";
import { CommandLineArgsError } from "./index";
import type { Config } from "./config";
import type { CfScriptFormat } from "./deployment-bundle/worker";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "./yargs-types";

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

	const config = readConfig(args.config, args);

	const configBindings: Partial<Config> = {
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
		constellation: config.constellation,
	};

	const secrets = getVarsForDev(
		{ configPath, vars: {} },
		args.env,
		true
	) as Record<string, string>;

	await generateTypes(
		{ ...configBindings, secrets },
		config,
		envInterface,
		outputPath
	);
}

type Secrets = Record<string, string>;

async function generateTypes(
	configToDTS: Partial<Config> & { secrets: Secrets },
	config: Config,
	envInterface: string,
	outputPath: string
) {
	const configContainsEntryPoint =
		config.main !== undefined || !!config.site?.["entry-point"];

	const entrypointFormat: CfScriptFormat = configContainsEntryPoint
		? (await getEntry({}, config, "types")).format
		: "modules";

	// Note: we infer whether the user has provided an envInterface by checking
	//       if it is different from the default `Env` value, this works well
	//       besides the fact that the user itself can actually provided `Env` as
	//       an argument... we either need to do this or removing the yargs
	//       default value for envInterface and do `envInterface ?? "Env"`,
	//       for a better UX we chose to go with the yargs default value
	const userProvidedEnvInterface = envInterface !== "Env";

	if (userProvidedEnvInterface && entrypointFormat === "service-worker") {
		logger.warn(
			"Ignoring the provided env-interface value as it only applies to ES Module syntax workers"
		);
	}

	const envTypeStructure: string[] = [];

	if (configToDTS.kv_namespaces) {
		for (const kvNamespace of configToDTS.kv_namespaces) {
			envTypeStructure.push(`${kvNamespace.binding}: KVNamespace;`);
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
				envTypeStructure.push(`${varName}: "${varValue}";`);
			}
			if (typeof varValue === "object" && varValue !== null) {
				envTypeStructure.push(`${varName}: ${JSON.stringify(varValue)};`);
			}
		}
	}

	for (const secretName in configToDTS.secrets) {
		envTypeStructure.push(`${secretName}: string;`);
	}

	if (configToDTS.durable_objects?.bindings) {
		for (const durableObject of configToDTS.durable_objects.bindings) {
			envTypeStructure.push(`${durableObject.name}: DurableObjectNamespace;`);
		}
	}

	if (configToDTS.r2_buckets) {
		for (const R2Bucket of configToDTS.r2_buckets) {
			envTypeStructure.push(`${R2Bucket.binding}: R2Bucket;`);
		}
	}

	if (configToDTS.d1_databases) {
		for (const d1 of configToDTS.d1_databases) {
			envTypeStructure.push(`${d1.binding}: D1Database;`);
		}
	}

	if (configToDTS.services) {
		for (const service of configToDTS.services) {
			envTypeStructure.push(`${service.binding}: Fetcher;`);
		}
	}

	if (configToDTS.constellation) {
		for (const service of configToDTS.constellation) {
			envTypeStructure.push(`${service.binding}: Fetcher;`);
		}
	}

	if (configToDTS.analytics_engine_datasets) {
		for (const analyticsEngine of configToDTS.analytics_engine_datasets) {
			envTypeStructure.push(
				`${analyticsEngine.binding}: AnalyticsEngineDataset;`
			);
		}
	}

	if (configToDTS.dispatch_namespaces) {
		for (const namespace of configToDTS.dispatch_namespaces) {
			envTypeStructure.push(`${namespace.binding}: DispatchNamespace;`);
		}
	}

	if (configToDTS.logfwdr?.bindings?.length) {
		envTypeStructure.push(`LOGFWDR_SCHEMA: any;`);
	}

	if (configToDTS.data_blobs) {
		for (const dataBlobs in configToDTS.data_blobs) {
			envTypeStructure.push(`${dataBlobs}: ArrayBuffer;`);
		}
	}

	if (configToDTS.text_blobs) {
		for (const textBlobs in configToDTS.text_blobs) {
			envTypeStructure.push(`${textBlobs}: string;`);
		}
	}

	if (configToDTS.unsafe?.bindings) {
		for (const unsafe of configToDTS.unsafe.bindings) {
			envTypeStructure.push(`${unsafe.name}: any;`);
		}
	}

	if (configToDTS.queues) {
		if (configToDTS.queues.producers) {
			for (const queue of configToDTS.queues.producers) {
				envTypeStructure.push(`${queue.binding}: Queue;`);
			}
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
					modulesTypeStructure.push(`declare module "*.${glob
						.split(".")
						.at(-1)}" {
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
		path: outputPath,
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
				`A non-wrangler ${path} already exists, please rename and try again.`
			);
		}
	} catch (error) {
		if (error instanceof Error && !error.message.includes("not found")) {
			throw error;
		}
	}

	let combinedTypeStrings = "";
	if (formatType === "modules") {
		combinedTypeStrings += `interface ${envInterface} {\n${envTypeStructure
			.map((value) => `\t${value}`)
			.join("\n")}\n}\n${modulesTypeStructure.join("\n")}`;
	} else {
		combinedTypeStrings += `export {};\ndeclare global {\n${envTypeStructure
			.map((value) => `\tconst ${value}`)
			.join("\n")}\n}\n${modulesTypeStructure.join("\n")}`;
	}

	if (envTypeStructure.length || modulesTypeStructure.length) {
		fs.writeFileSync(
			path,
			`// Generated by Wrangler on ${new Date()}` + "\n" + combinedTypeStrings
		);
		logger.log(combinedTypeStrings);
	}
}
