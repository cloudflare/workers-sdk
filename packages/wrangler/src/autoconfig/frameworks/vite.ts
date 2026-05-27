import { Framework } from "./framework-class";
import {
	getInstalledPackageVersion,
	getPackageJsonDependencyVersion,
} from "./utils/packages";
import {
	assertCanTransformViteConfig,
	checkIfViteConfigUsesCloudflarePlugin,
	createViteConfigWithCloudflarePlugin,
	hasViteConfig,
	transformViteConfig,
} from "./utils/vite-config";
import { installCloudflareVitePlugin } from "./utils/vite-plugin";
import type { AutoConfigFrameworkPackageInfo } from ".";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";

export class Vite extends Framework {
	isConfigured(projectPath: string): boolean {
		return checkIfViteConfigUsesCloudflarePlugin(projectPath);
	}

	validateFrameworkVersion(
		projectPath: string,
		frameworkPackageInfo: AutoConfigFrameworkPackageInfo
	): void {
		const declaredVersion = getPackageJsonDependencyVersion(
			frameworkPackageInfo.name,
			projectPath
		);

		if (declaredVersion) {
			this.validateAndSetFrameworkVersion(
				declaredVersion,
				frameworkPackageInfo
			);
			return;
		}

		const installedVersion = getInstalledPackageVersion(
			frameworkPackageInfo.name,
			projectPath,
			{ stopAtProjectPath: true }
		);

		if (installedVersion) {
			this.validateAndSetFrameworkVersion(
				installedVersion,
				frameworkPackageInfo
			);
			return;
		}

		super.validateFrameworkVersion(projectPath, frameworkPackageInfo);
	}

	async configure({
		dryRun,
		projectPath,
		packageManager,
		isWorkspaceRoot,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (!dryRun) {
			const viteConfigExists = hasViteConfig(projectPath);
			if (viteConfigExists) {
				assertCanTransformViteConfig(projectPath);
			}

			await installCloudflareVitePlugin({
				packageManager: packageManager.type,
				isWorkspaceRoot,
				projectPath,
			});

			if (viteConfigExists) {
				transformViteConfig(projectPath);
			} else {
				createViteConfigWithCloudflarePlugin(projectPath);
			}
		}

		return {
			wranglerConfig: {
				assets: {
					not_found_handling: "single-page-application",
				},
			},
		};
	}
}
