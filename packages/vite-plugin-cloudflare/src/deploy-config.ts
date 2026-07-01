import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as wrangler from "wrangler";
import { resolveDevOnly } from "./plugin-config";
import type {
	AssetsOnlyResolvedConfig,
	WorkersResolvedConfig,
} from "./plugin-config";
import type * as vite from "vite";
import type { Unstable_Config } from "wrangler";

interface DeployConfig {
	configPath: string;
	auxiliaryWorkers: Array<{ configPath: string }>;
	prerenderWorkerConfigPath?: string;
}

function getDeployConfigPath(root: string) {
	return path.resolve(root, ".wrangler", "deploy", "config.json");
}

export function getWorkerConfigs(
	root: string,
	isPrerender: boolean
): Unstable_Config[] {
	const deployConfigPath = getDeployConfigPath(root);
	const deployConfig = JSON.parse(
		fs.readFileSync(deployConfigPath, "utf-8")
	) as DeployConfig;

	return [
		...(isPrerender && deployConfig.prerenderWorkerConfigPath
			? [{ configPath: deployConfig.prerenderWorkerConfigPath }]
			: [{ configPath: deployConfig.configPath }]),
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

	const auxiliaryWorkerEnvironmentNames =
		resolvedPluginConfig.type === "workers"
			? [...resolvedPluginConfig.environmentNameToWorkerMap.entries()]
					.filter(
						([name, worker]) =>
							name !== resolvedPluginConfig.entryWorkerEnvironmentName &&
							name !== resolvedPluginConfig.prerenderWorkerEnvironmentName &&
							!resolveDevOnly(worker.devOnly)
					)
					.map(([name]) => name)
			: [];

	let entryEnvironmentName: string;

	if (isAssetsOnly) {
		entryEnvironmentName = "client";
	} else {
		assert(
			resolvedPluginConfig.type === "workers",
			`Unexpected error: expected workers config but got ${resolvedPluginConfig.type}`
		);
		entryEnvironmentName = resolvedPluginConfig.entryWorkerEnvironmentName;
	}

	const deployConfig: DeployConfig = {
		configPath: resolveConfigPath(entryEnvironmentName),
		auxiliaryWorkers: auxiliaryWorkerEnvironmentNames.map((name) => ({
			configPath: resolveConfigPath(name),
		})),
		prerenderWorkerConfigPath:
			resolvedPluginConfig.prerenderWorkerEnvironmentName
				? resolveConfigPath(resolvedPluginConfig.prerenderWorkerEnvironmentName)
				: undefined,
	};

	fs.writeFileSync(deployConfigPath, JSON.stringify(deployConfig));
}
