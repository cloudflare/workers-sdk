import { Framework } from "./framework-class";
import {
	checkIfViteConfigUsesCloudflarePlugin,
	transformViteConfig,
} from "./utils/vite-config";
import { installCloudflareVitePlugin } from "./utils/vite-plugin";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";

export class Vite extends Framework {
	isConfigured(projectPath: string): boolean {
		return checkIfViteConfigUsesCloudflarePlugin(projectPath);
	}

	async configure({
		dryRun,
		projectPath,
		packageManager,
		isWorkspaceRoot,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (!dryRun) {
			await installCloudflareVitePlugin({
				packageManager: packageManager.type,
				isWorkspaceRoot,
				projectPath,
			});

			transformViteConfig(projectPath);
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
