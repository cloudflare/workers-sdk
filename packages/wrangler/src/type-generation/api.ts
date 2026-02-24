import { stat } from "node:fs/promises";
import { UserError } from "@cloudflare/workers-utils";
import { readConfig } from "../config";
import { getEntry } from "../deployment-bundle/entry";
import { generateRuntimeTypes } from "./runtime";
import { generateEnvTypes } from ".";
import type { Entry } from "../deployment-bundle/entry";
import type { Config } from "@cloudflare/workers-utils";

interface BaseGenerateTypesOptions {
	/**
	 * Additional worker configs for cross-worker type generation
	 * (Durable Objects, Services, Workflows from other workers).
	 */
	additionalWorkerConfigs?: Array<{
		configPath: string;
	}>;

	/**
	 * Path to .env file for loading secret bindings.
	 */
	envFile?: string;

	/**
	 * Name of the generated Env interface.
	 *
	 * @default "Env"
	 */
	envInterface?: string;

	/**
	 * The target environment name (from wrangler.jsonc "env.X" sections).
	 *
	 * If not specified, generates aggregated types for all environments.
	 */
	environment?: string;

	/**
	 * Whether to include environment/binding types.
	 *
	 * @default true
	 */
	includeEnv?: boolean;

	/**
	 * Whether to include runtime types generated from workerd.
	 *
	 * @default true
	 */
	includeRuntime?: boolean;

	/**
	 * The output path for generated types (used for generating correct import paths).
	 *
	 * @default "worker-configuration.d.ts"
	 */
	outputPath?: string;

	/**
	 * Whether to generate literal/union types for vars (strict) or loose types.
	 *
	 * @default true
	 */
	strictVars?: boolean;
}

export type GenerateTypesOptions = BaseGenerateTypesOptions &
	(
		| {
				/**
				 * Pre-parsed Config object from readConfig().
				 * Either this or `configPath` must be provided.
				 */
				config?: never;

				/**
				 * Path to the wrangler configuration file.
				 * Either this or `config` must be provided.
				 *
				 * @example
				 * ```
				 * "path/to/wrangler.jsonc"
				 * ```
				 */
				configPath?: string;
		  }
		| {
				/**
				 * Pre-parsed Config object from readConfig().
				 * Either this or `configPath` must be provided.
				 */
				config?: Config;

				/**
				 * Path to the wrangler configuration file.
				 * Either this or `config` must be provided.
				 *
				 * @example
				 * ```
				 * "path/to/wrangler.jsonc"
				 * ```
				 */
				configPath?: never;
		  }
	);

export interface GenerateTypesResult {
	/**
	 * The generated environment/binding types as a TypeScript declaration string.
	 *
	 * This includes the Cloudflare namespace, Env interface, and module declarations.
	 *
	 * Includes the `eslint-disable` comment and env header.
	 */
	env: string;

	/**
	 * The generated runtime types from workerd.
	 *
	 * `null` if `includeRuntime` was set to `false`.
	 *
	 * When present, includes the runtime header comment.
	 */
	runtime: string | null;

	/**
	 * The runtime header comment (e.g., "// Runtime types generated with workerd@...").
	 *
	 * This is provided separately for cases where you need to insert it into the header
	 * section when combining env and runtime types.
	 *
	 * `null` if `includeRuntime` was set to `false`.
	 */
	runtimeHeader: string | null;
}

/**
 * Generates TypeScript type definitions for a Cloudflare Worker project.
 *
 * This function provides a programmatic API for generating Worker types,
 * equivalent to running `wrangler types` from the command line.
 *
 * @param options - Configuration options for type generation
 *
 * @returns An object containing the generated environment and runtime types
 *
 * @example
 * ```ts
 * import { unstable_generateTypes } from 'wrangler';
 *
 * const {
 * 	env,	// Environment types string
 * 	runtime,	// Runtime types string or null
 * } = await unstable_generateTypes({
 *     configPath: './wrangler.jsonc',
 * });
 * ```
 */
export async function generateTypes(
	options: GenerateTypesOptions
): Promise<GenerateTypesResult> {
	if (!options.configPath && !options.config) {
		throw new UserError(
			"Either `configPath` or `config` must be provided to generateTypes()"
		);
	}

	const config =
		options.config ??
		readConfig({
			config: options.configPath,
		});

	if (!config.configPath) {
		throw new UserError(
			`No config file detected${options.configPath ? ` (at ${options.configPath})` : ""}. This function requires a Wrangler configuration file.`
		);
	}

	const configStat = await stat(config.configPath).catch(() => null);
	if (!configStat || configStat.isDirectory()) {
		throw new UserError(
			`No config file detected${options.configPath ? ` (at ${options.configPath})` : ""}. This function requires a Wrangler configuration file.`
		);
	}

	const {
		envInterface = "Env",
		includeEnv = true,
		includeRuntime = true,
		outputPath = "worker-configuration.d.ts",
		strictVars = true,
	} = options;

	if (!includeEnv && !includeRuntime) {
		throw new UserError(
			"At least one of `includeEnv` or `includeRuntime` must be true"
		);
	}

	const secondaryEntries = new Map<string, Entry>();
	if (
		options.additionalWorkerConfigs &&
		options.additionalWorkerConfigs.length > 0
	) {
		for (const additionalConfig of options.additionalWorkerConfigs) {
			const secondaryConfig = readConfig({
				config: additionalConfig.configPath,
			});

			const serviceEntry = await getEntry({}, secondaryConfig, "types");
			if (!serviceEntry.name) {
				throw new UserError(
					`Could not resolve entry point for service config '${additionalConfig.configPath}'.`
				);
			}

			secondaryEntries.set(serviceEntry.name, serviceEntry);
		}
	}

	const configContainsEntrypoint =
		config.main !== undefined || !!config.site?.["entry-point"];

	let entrypoint: Entry | undefined;
	if (configContainsEntrypoint) {
		try {
			entrypoint = await getEntry({}, config, "types");
		} catch {
			entrypoint = undefined;
		}
	}

	let envOutput = "";
	if (includeEnv) {
		const { envHeader, envTypes } = await generateEnvTypes(
			config,
			{
				config: config.configPath,
				env: options.environment,
				envFile: options.envFile ? [options.envFile] : undefined,
				strictVars,
			},
			envInterface,
			outputPath,
			entrypoint,
			secondaryEntries,
			false // Do not write logs since this is a pragmatic API
		);

		// Build the env output
		const envParts = new Array<string>();
		if (envHeader) {
			envParts.push("/* eslint-disable */");
			envParts.push(envHeader);
		}
		if (envTypes) {
			envParts.push(envTypes);
		}

		envOutput = envParts.join("\n");
	}

	let runtimeOutput: string | null = null;
	let runtimeHeaderOutput: string | null = null;
	if (includeRuntime) {
		const { runtimeHeader, runtimeTypes } = await generateRuntimeTypes({
			config,
			outFile: outputPath,
		});

		runtimeHeaderOutput = runtimeHeader;
		runtimeOutput = `// Begin runtime types\n${runtimeTypes}`;
	}

	return {
		env: envOutput,
		runtime: runtimeOutput,
		runtimeHeader: runtimeHeaderOutput,
	};
}

/**
 * Formats the generated types for writing to a file.
 *
 * This is a convenience function that combines the env and runtime types
 * into a single string suitable for writing to a .d.ts file.
 *
 * The output format is:
 * 1. `/* eslint-disable * /` (Always present when writing to file)
 * 2. `Env` header (if env types present)
 * 3. Runtime header (if runtime types present)
 * 4. `Env` type declarations (if env types present)
 * 5. Runtime type declarations (if runtime types present)
 *
 * @param result - The result from generateTypes()
 *
 * @returns A formatted string ready to write to a file
 */
export function formatGeneratedTypes(result: GenerateTypesResult): string {
	// If we have env types, we need to insert the runtime header after the env header
	// but before the actual type declarations
	if (result.env && result.runtimeHeader) {
		// The env output format is:
		// ```ts
		// /* eslint-disable */
		// // Generated by Wrangler...
		// declare namespace Cloudflare { ... }
		// ```
		// We need to insert the runtime header after the "// Generated by" line
		const envLines = result.env.split("\n");
		const headerEndIndex = envLines.findIndex(
			(line) =>
				!line.startsWith("/* eslint-disable */") &&
				!line.startsWith("// Generated by Wrangler")
		);

		if (headerEndIndex > 0) {
			// Insert runtime header before the type declarations
			const header = envLines.slice(0, headerEndIndex);
			const types = envLines.slice(headerEndIndex);
			return [
				...header,
				result.runtimeHeader,
				...types,
				result.runtime ?? "",
			].join("\n");
		}
	}

	// If we only have runtime types (no env), include the eslint-disable comment
	if (!result.env && result.runtimeHeader) {
		return [
			"/* eslint-disable */",
			result.runtimeHeader,
			result.runtime ?? "",
		].join("\n");
	}

	// Fallback: Simple concatenation
	const parts = new Array<string>();
	if (result.env) {
		parts.push(result.env);
	}
	if (result.runtimeHeader) {
		parts.push(result.runtimeHeader);
	}
	if (result.runtime) {
		parts.push(result.runtime);
	}

	return parts.join("\n");
}
