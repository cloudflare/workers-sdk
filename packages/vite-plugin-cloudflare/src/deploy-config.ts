import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as wrangler from "wrangler";
import type {
	AssetsOnlyResolvedConfig,
	WorkersResolvedConfig,
} from "./plugin-config";
import type * as vite from "vite";

interface DeployConfig {
	configPath: string;
	auxiliaryWorkers: Array<{ configPath: string }>;
	prerenderWorkerConfigPath?: string;
}

function getDeployConfigPath(root: string) {
	return path.resolve(root, ".wrangler", "deploy", "config.json");
}

export function getWorkerConfigs(root: string, isPrerender: boolean) {
	const deployConfigPath = getDeployConfigPath(root);
	const deployConfig = JSON.parse(
		fs.readFileSync(deployConfigPath, "utf-8")
	) as DeployConfig;

	return [
		...(isPrerender && deployConfig.prerenderWorkerConfigPath
			? [{ configPath: deployConfig.prerenderWorkerConfigPath }]
			: []),
		{ configPath: deployConfig.configPath },
		...deployConfig.auxiliaryWorkers,
	].map(({ configPath }) => {
		const resolvedConfigPath = path.resolve(
			path.dirname(deployConfigPath),
			configPath
		);
		return wrangler.unstable_readConfig({ config: resolvedConfigPath });
	});
}

export function writeDeployConfig(
	resolvedPluginConfig: AssetsOnlyResolvedConfig | WorkersResolvedConfig,
	resolvedViteConfig: vite.ResolvedConfig,
	isAssetsOnly: boolean
) {
	const deployConfigPath = getDeployConfigPath(resolvedViteConfig.root);
	const deployConfigDirectory = path.dirname(deployConfigPath);

	fs.mkdirSync(deployConfigDirectory, { recursive: true });

	const resolveConfigPath = (environmentName: string) => {
		const outputDirectory =
			resolvedViteConfig.environments[environmentName]?.build.outDir;

		assert(
			outputDirectory,
			`Unexpected error: ${environmentName} environment output directory is undefined`
		);

		return path.relative(
			deployConfigDirectory,
			path.resolve(resolvedViteConfig.root, outputDirectory, "wrangler.json")
		);
	};

	let entryEnvironmentName: string;
	let auxiliaryEnvironmentNames: string[];

	if (isAssetsOnly) {
		entryEnvironmentName = "client";
		auxiliaryEnvironmentNames = [];
	} else {
		assert(
			resolvedPluginConfig.type === "workers",
			`Unexpected error: expected workers config but got ${resolvedPluginConfig.type}`
		);
		entryEnvironmentName = resolvedPluginConfig.entryWorkerEnvironmentName;
		auxiliaryEnvironmentNames = [
			...resolvedPluginConfig.environmentNameToWorkerMap.keys(),
		].filter(
			(name) =>
				name !== entryEnvironmentName &&
				name !== resolvedPluginConfig.prerenderWorkerEnvironmentName
		);
	}

	const deployConfig: DeployConfig = {
		configPath: resolveConfigPath(entryEnvironmentName),
		auxiliaryWorkers: auxiliaryEnvironmentNames.map((name) => ({
			configPath: resolveConfigPath(name),
		})),
		prerenderWorkerConfigPath:
			resolvedPluginConfig.prerenderWorkerEnvironmentName
				? resolveConfigPath(resolvedPluginConfig.prerenderWorkerEnvironmentName)
				: undefined,
	};

	fs.writeFileSync(deployConfigPath, JSON.stringify(deployConfig));
}
