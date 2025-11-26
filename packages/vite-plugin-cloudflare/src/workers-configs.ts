import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import {
	unstable_defaultWranglerConfig,
	unstable_getDevCompatibilityDate,
	unstable_getWorkerNameFromProject,
	unstable_readConfig,
} from "wrangler";
import type { AssetsOnlyConfig, WorkerConfig } from "./plugin-config";
import type { Optional } from "./utils";
import type { Unstable_Config as RawWorkerConfig } from "wrangler";

export type WorkerResolvedConfig =
	| AssetsOnlyWorkerResolvedConfig
	| WorkerWithServerLogicResolvedConfig;

export interface AssetsOnlyWorkerResolvedConfig
	extends WorkerBaseResolvedConfig {
	type: "assets-only";
	config: AssetsOnlyConfig;
}

export interface WorkerWithServerLogicResolvedConfig
	extends WorkerBaseResolvedConfig {
	type: "worker";
	config: WorkerConfig;
}

interface WorkerBaseResolvedConfig {
	raw: RawWorkerConfig;
	nonApplicable: NonApplicableConfigMap;
}

export type SanitizedWorkerConfig = Omit<
	RawWorkerConfig,
	keyof NonApplicableConfig
>;

type NonApplicableConfigMap = {
	replacedByVite: Set<
		Extract<
			keyof RawWorkerConfig,
			keyof NonApplicableWorkerConfigsInfo["replacedByVite"]
		>
	>;
	notRelevant: Set<
		Extract<
			keyof RawWorkerConfig,
			NonApplicableWorkerConfigsInfo["notRelevant"][number]
		>
	>;
};

type NonApplicableWorkerConfigsInfo = typeof nonApplicableWorkerConfigs;

type NonApplicableConfig =
	| NonApplicableConfigReplacedByVite
	| NonApplicableConfigNotRelevant;

type NonApplicableConfigReplacedByVite =
	keyof NonApplicableWorkerConfigsInfo["replacedByVite"];

type NonApplicableConfigNotRelevant =
	NonApplicableWorkerConfigsInfo["notRelevant"][number];

/**
 * Set of worker config options that are not applicable when using Vite
 */
export const nonApplicableWorkerConfigs = {
	/**
	 * Object containing configs that have a vite replacement, the object's field contain details about the config's replacement
	 */
	replacedByVite: {
		alias: {
			viteReplacement: "resolve.alias",
			viteDocs: "https://vite.dev/config/shared-options.html#resolve-alias",
		},
		define: {
			viteReplacement: "define",
			viteDocs: "https://vite.dev/config/shared-options.html#define",
		},
		minify: {
			viteReplacement: "build.minify",
			viteDocs: "https://vite.dev/config/build-options.html#build-minify",
		},
	},
	/**
	 * All the configs that are not relevant when using Vite (meaning that in the context of a Vite
	 * application they lose their purpose/meaning)
	 */
	notRelevant: [
		"base_dir",
		"build",
		"find_additional_modules",
		"no_bundle",
		"preserve_file_names",
		"rules",
		"site",
		"tsconfig",
	],
} as const;

/**
 * The non applicable configs that can be and default to `undefined`
 */
const nullableNonApplicable = [
	"alias",
	"base_dir",
	"find_additional_modules",
	"minify",
	"no_bundle",
	"preserve_file_names",
	"site",
	"tsconfig",
] as const;

function readWorkerConfig(
	configPath: string,
	env: string | undefined
): {
	raw: RawWorkerConfig;
	config: SanitizedWorkerConfig;
	nonApplicable: NonApplicableConfigMap;
} {
	const nonApplicable: NonApplicableConfigMap = {
		replacedByVite: new Set(),
		notRelevant: new Set(),
	};
	const config: Optional<RawWorkerConfig, "build" | "define"> =
		unstable_readConfig(
			{ config: configPath, env },
			// Preserve the original `main` value so that Vite can resolve it
			{ preserveOriginalMain: true }
		);
	const raw = structuredClone(config) as RawWorkerConfig;

	nullableNonApplicable.forEach((prop) => {
		if (config[prop] !== undefined) {
			if (isReplacedByVite(prop)) {
				nonApplicable.replacedByVite.add(prop);
			}

			if (isNotRelevant(prop)) {
				nonApplicable.notRelevant.add(prop);
			}
		}
		delete config[prop];
	});

	// config.build is always defined as an object and by default it has the `command` and `cwd` fields
	// set to `undefined` but the `watch_dir` field set to `"./src"`, so to check if the user set it
	// we need to check `command` and `cwd`
	if (config.build && (config.build.command || config.build.cwd)) {
		nonApplicable.notRelevant.add("build");
	}
	delete config["build"];

	if (config.define && Object.keys(config.define).length > 0) {
		nonApplicable.replacedByVite.add("define");
	}
	delete config["define"];

	if (config.rules.length > 0) {
		nonApplicable.notRelevant.add("rules");
	}

	return {
		raw,
		nonApplicable,
		config: config as SanitizedWorkerConfig,
	};
}

export function getWarningForWorkersConfigs(
	configs:
		| {
				entryWorker: AssetsOnlyWorkerResolvedConfig;
		  }
		| {
				entryWorker: WorkerWithServerLogicResolvedConfig;
				auxiliaryWorkers: WorkerResolvedConfig[];
		  }
): string | undefined {
	if (
		!("auxiliaryWorkers" in configs) ||
		configs.auxiliaryWorkers.length === 0
	) {
		const nonApplicableLines = getWorkerNonApplicableWarnLines(
			configs.entryWorker,
			`  - `
		);

		if (nonApplicableLines.length === 0) {
			return;
		}

		const lines = [
			`\n\n\x1b[43mWARNING\x1b[0m: your worker config${configs.entryWorker.config.configPath ? ` (at \`${path.relative("", configs.entryWorker.config.configPath)}\`)` : ""} contains` +
				" the following configuration options which are ignored since they are not applicable when using Vite:",
		];

		nonApplicableLines.forEach((line) => lines.push(line));

		lines.push("");
		return lines.join("\n");
	}

	const lines: string[] = [];

	const processWorkerConfig = (
		workerConfig: WorkerResolvedConfig,
		isEntryWorker = false
	) => {
		const nonApplicableLines = getWorkerNonApplicableWarnLines(
			workerConfig,
			`    - `
		);

		if (nonApplicableLines.length > 0) {
			lines.push(
				`  - (${isEntryWorker ? "entry" : "auxiliary"}) worker${workerConfig.config.name ? ` "${workerConfig.config.name}"` : ""}${workerConfig.config.configPath ? ` (config at \`${path.relative("", workerConfig.config.configPath)}\`)` : ""}`
			);
			nonApplicableLines.forEach((line) => lines.push(line));
		}
	};

	processWorkerConfig(configs.entryWorker, true);
	configs.auxiliaryWorkers.forEach((config) => processWorkerConfig(config));

	if (lines.length === 0) {
		return;
	}

	return [
		"\n\x1b[43mWARNING\x1b[0m: your workers configs contain configuration options which are ignored since they are not applicable when using Vite:",
		...lines,
		"",
	].join("\n");
}

function getWorkerNonApplicableWarnLines(
	workerConfig: WorkerResolvedConfig,
	linePrefix: string
): string[] {
	const lines: string[] = [];

	const { replacedByVite, notRelevant } = workerConfig.nonApplicable;

	for (const config of replacedByVite) {
		lines.push(
			`${linePrefix}\`${config}\` which is replaced by Vite's \`${nonApplicableWorkerConfigs.replacedByVite[config].viteReplacement}\` (docs: ${nonApplicableWorkerConfigs.replacedByVite[config].viteDocs})`
		);
	}

	if (notRelevant.size > 0)
		lines.push(
			`${linePrefix}${[...notRelevant].map((config) => `\`${config}\``).join(", ")} which ${notRelevant.size > 1 ? "are" : "is"} not relevant in the context of a Vite project`
		);

	return lines;
}

function isReplacedByVite(
	configName: string
): configName is NonApplicableConfigReplacedByVite {
	return configName in nonApplicableWorkerConfigs["replacedByVite"];
}

function isNotRelevant(
	configName: string
): configName is NonApplicableConfigNotRelevant {
	return nonApplicableWorkerConfigs.notRelevant.includes(configName as any);
}

function missingFieldErrorMessage(
	field: string,
	configPath: string,
	env: string | undefined
) {
	return `No ${field} field provided in '${configPath}'${env ? ` for '${env}' environment` : ""}`;
}

export function getWorkerConfig(
	configPath: string,
	env: string | undefined,
	opts?: {
		visitedConfigPaths?: Set<string>;
		isEntryWorker?: boolean;
	}
): WorkerResolvedConfig {
	if (opts?.visitedConfigPaths?.has(configPath)) {
		throw new Error(`Duplicate Wrangler config path found: ${configPath}`);
	}

	const { raw, config, nonApplicable } = readWorkerConfig(configPath, env);

	opts?.visitedConfigPaths?.add(configPath);

	if (!config.name) {
		throw new Error(missingFieldErrorMessage(`'name'`, configPath, env));
	}

	if (!config.topLevelName) {
		throw new Error(
			missingFieldErrorMessage(`top-level 'name'`, configPath, env)
		);
	}

	if (!config.compatibility_date) {
		throw new Error(
			missingFieldErrorMessage(`'compatibility_date`, configPath, env)
		);
	}

	const requiredFields = {
		topLevelName: config.topLevelName,
		name: config.name,
		compatibility_date: config.compatibility_date,
	};

	if (opts?.isEntryWorker && !config.main) {
		return {
			type: "assets-only",
			raw,
			config: {
				...config,
				...requiredFields,
			},
			nonApplicable,
		};
	}

	if (!config.main) {
		throw new Error(missingFieldErrorMessage(`'main'`, configPath, env));
	}

	return {
		type: "worker",
		raw,
		config: {
			...config,
			...requiredFields,
			main: maybeResolveMain(config.main, configPath),
		},
		nonApplicable,
	};
}

/**
 * Generates a default worker config for zero-config mode when no wrangler config file is found.
 * The worker name is derived from package.json name or directory basename.
 * The compatibility date is taken from the installed workerd runtime.
 *
 * @param root the root of the vite project
 * @returns an assets-only worker config with sensible defaults
 */
export function getDefaultWorkerConfig(
	root: string
): AssetsOnlyWorkerResolvedConfig {
	const workerName = unstable_getWorkerNameFromProject(root);
	const compatibilityDate = unstable_getDevCompatibilityDate(undefined);

	// Start with the full default config to ensure all required fields have proper defaults,
	// then override the fields specific to this zero-config worker
	const config: RawWorkerConfig = {
		...unstable_defaultWranglerConfig,
		topLevelName: workerName,
		name: workerName,
		compatibility_date: compatibilityDate,
	};

	return {
		type: "assets-only",
		raw: config,
		config: config as AssetsOnlyConfig,
		nonApplicable: {
			replacedByVite: new Set(),
			notRelevant: new Set(),
		},
	};
}

const ENTRY_MODULE_EXTENSIONS = [".js", ".mjs", ".ts", ".mts", ".jsx", ".tsx"];

/**
 * If `main` ends with a valid file extension it is resolved to an absolute path.
 * Else `main` is returned as is so that it can be resolved by Vite.
 * This enables resolving entry modules relative to the Worker config while also supporting virtual modules and package exports.
 */
function maybeResolveMain(main: string, configPath: string): string {
	if (!ENTRY_MODULE_EXTENSIONS.some((extension) => main.endsWith(extension))) {
		return main;
	}

	// Resolve `main` to an absolute path
	const resolvedMain = path.resolve(path.dirname(configPath), main);

	if (!fs.existsSync(resolvedMain)) {
		throw new Error(
			`The provided Wrangler config main field (${resolvedMain}) doesn't point to an existing file`
		);
	}

	return resolvedMain;
}

/**
 * Returns the path to a wrangler config for a worker after having it validated
 * (throws appropriate errors in case the validation fails)
 *
 * @param root the root of the vite project
 * @param requestedConfigPath the requested config path, if any
 * @param isForAuxiliaryWorker whether the config path is being requested for an auxiliary worker
 * @returns a valid path to a config file, or undefined for entry workers when no config is found (zero-config mode)
 */
export function getValidatedWranglerConfigPath(
	root: string,
	requestedConfigPath: string | undefined,
	isForAuxiliaryWorker: true
): string;
export function getValidatedWranglerConfigPath(
	root: string,
	requestedConfigPath: string | undefined,
	isForAuxiliaryWorker?: boolean
): string | undefined;
export function getValidatedWranglerConfigPath(
	root: string,
	requestedConfigPath: string | undefined,
	isForAuxiliaryWorker = false
): string | undefined {
	if (requestedConfigPath) {
		const configPath = path.resolve(root, requestedConfigPath);

		const forAuxiliaryWorkerErrorMessage = isForAuxiliaryWorker
			? " requested for one of your auxiliary workers"
			: "";

		const errorMessagePrefix = `The provided configPath (${configPath})${forAuxiliaryWorkerErrorMessage}`;

		const fileExtension = path.extname(configPath).slice(1);

		if (!allowedWranglerConfigExtensions.includes(fileExtension)) {
			const foundExtensionMessage = !fileExtension
				? "no extension found"
				: `"${fileExtension}" found`;
			throw new Error(
				`${errorMessagePrefix} doesn't point to a file with the correct file extension. It should point to a jsonc, json or toml file (${foundExtensionMessage} instead)`
			);
		}

		const mainStat = fs.statSync(configPath, { throwIfNoEntry: false });
		if (!mainStat) {
			throw new Error(
				`${errorMessagePrefix} doesn't point to an existing file`
			);
		}
		if (mainStat.isDirectory()) {
			throw new Error(
				`${errorMessagePrefix} points to a directory. It should point to a file.`
			);
		}

		return configPath;
	}

	// the plugin's API requires auxiliary workers to always specify their config paths
	assert(
		isForAuxiliaryWorker === false,
		"Unexpected Error: trying to find the wrangler config for an auxiliary worker"
	);

	const configPath = findWranglerConfig(root);

	// Return undefined for zero-config mode when no config file is found
	return configPath;
}

// We can't rely on `readConfig` from Wrangler to find the config as it may be relative to a different root that's set by the user.
function findWranglerConfig(root: string): string | undefined {
	for (const extension of allowedWranglerConfigExtensions) {
		const configPath = path.join(root, `wrangler.${extension}`);

		if (fs.existsSync(configPath)) {
			return configPath;
		}
	}
}

const allowedWranglerConfigExtensions = ["jsonc", "json", "toml"];
