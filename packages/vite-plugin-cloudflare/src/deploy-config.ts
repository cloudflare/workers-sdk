import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vite from "vite";
import { unstable_readConfig } from "wrangler";
import type {
	AssetsOnlyResolvedConfig,
	WorkersResolvedConfig,
} from "./plugin-config";

interface DeployConfig {
	configPath: string;
	auxiliaryWorkers: Array<{ configPath: string }>;
}

function getDeployConfigPath(root: string) {
	return path.resolve(root, ".wrangler", "deploy", "config.json");
}

export function getWorkerConfigs(root: string) {
	const deployConfigPath = getDeployConfigPath(root);
	const deployConfig = JSON.parse(
		fs.readFileSync(deployConfigPath, "utf-8")
	) as DeployConfig;

	return [
		{ configPath: deployConfig.configPath },
		...deployConfig.auxiliaryWorkers,
	].map(({ configPath }) => {
		const resolvedConfigPath = path.resolve(
			path.dirname(deployConfigPath),
			configPath
		);
		return unstable_readConfig({ config: resolvedConfigPath });
	});
}

function getRelativePathToWorkerConfig(
	deployConfigDirectory: string,
	root: string,
	outputDirectory: string
) {
	return path.relative(
		deployConfigDirectory,
		path.resolve(root, outputDirectory, "wrangler.json")
	);
}

export function writeDeployConfig(
	resolvedPluginConfig: AssetsOnlyResolvedConfig | WorkersResolvedConfig,
	resolvedViteConfig: vite.ResolvedConfig
) {
	const deployConfigPath = getDeployConfigPath(resolvedViteConfig.root);
	const deployConfigDirectory = path.dirname(deployConfigPath);

	fs.mkdirSync(deployConfigDirectory, { recursive: true });

	if (resolvedPluginConfig.type === "assets-only") {
		const clientOutputDirectory =
			resolvedViteConfig.environments.client?.build.outDir;

		assert(
			clientOutputDirectory,
			"Unexpected error: client environment output directory is undefined"
		);

		const deployConfig: DeployConfig = {
			configPath: getRelativePathToWorkerConfig(
				deployConfigDirectory,
				resolvedViteConfig.root,
				clientOutputDirectory
			),
			auxiliaryWorkers: [],
		};

		fs.writeFileSync(deployConfigPath, JSON.stringify(deployConfig));
	} else {
		let entryWorkerConfigPath: string | undefined;
		const auxiliaryWorkers: DeployConfig["auxiliaryWorkers"] = [];

		for (const environmentName of Object.keys(resolvedPluginConfig.workers)) {
			const outputDirectory =
				resolvedViteConfig.environments[environmentName]?.build.outDir;

			assert(
				outputDirectory,
				`Unexpected error: ${environmentName} environment output directory is undefined`
			);

			const configPath = getRelativePathToWorkerConfig(
				deployConfigDirectory,
				resolvedViteConfig.root,
				outputDirectory
			);

			if (environmentName === resolvedPluginConfig.entryWorkerEnvironmentName) {
				entryWorkerConfigPath = configPath;
			} else {
				auxiliaryWorkers.push({ configPath });
			}
		}

		assert(
			entryWorkerConfigPath,
			`Unexpected error: entryWorkerConfigPath is undefined`
		);

		const deployConfig: DeployConfig = {
			configPath: entryWorkerConfigPath,
			auxiliaryWorkers,
		};

		fs.writeFileSync(deployConfigPath, JSON.stringify(deployConfig));
	}
}
