import * as fs from "node:fs";
import * as path from "node:path";
import { WORKER_ENTRY_NAME } from "./constants";
import { getOutputDirectory } from "./rsbuild-config";
import type { ResolvedPluginConfig } from "./config";
import type { RsbuildConfig, Rspack } from "@rsbuild/core";
import type { Unstable_RawConfig } from "wrangler";

export function createOutputConfig(
	resolvedConfig: ResolvedPluginConfig,
	main: string
): Unstable_RawConfig {
	const {
		configPath: _configPath,
		userConfigPath: _userConfigPath,
		topLevelName: _topLevelName,
		definedEnvironments: _definedEnvironments,
		targetEnvironment: _targetEnvironment,
		...workerConfig
	} = resolvedConfig.workerConfig;
	const outputConfig: Unstable_RawConfig = {
		...workerConfig,
		main,
		no_bundle: true,
		rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
	};

	if (outputConfig.unsafe && Object.keys(outputConfig.unsafe).length === 0) {
		outputConfig.unsafe = undefined;
	}

	return outputConfig;
}

export function emitWorkerConfigAsset(
	resolvedConfig: ResolvedPluginConfig,
	assets: Record<string, Rspack.sources.Source>,
	sources: Pick<typeof Rspack.sources, "RawSource">
): void {
	assets["wrangler.json"] = new sources.RawSource(
		JSON.stringify(
			createOutputConfig(resolvedConfig, `${WORKER_ENTRY_NAME}.js`)
		)
	);
}

export function writeDeployConfig(
	resolvedConfig: ResolvedPluginConfig,
	rsbuildConfig: RsbuildConfig
): void {
	const deployConfigPath = path.resolve(
		resolvedConfig.root,
		".wrangler",
		"deploy",
		"config.json"
	);
	const deployConfigDirectory = path.dirname(deployConfigPath);
	const workerOutputDirectory = path.resolve(
		resolvedConfig.root,
		getOutputDirectory(rsbuildConfig, resolvedConfig.environmentName)
	);

	fs.mkdirSync(deployConfigDirectory, { recursive: true });
	fs.writeFileSync(
		deployConfigPath,
		JSON.stringify({
			configPath: path.relative(
				deployConfigDirectory,
				path.join(workerOutputDirectory, "wrangler.json")
			),
			auxiliaryWorkers: [],
		})
	);
}
