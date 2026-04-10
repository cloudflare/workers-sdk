import { Framework } from "./framework-class";
import { transformViteConfig } from "./utils/vite-config";
import { installCloudflareVitePlugin } from "./utils/vite-plugin";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";

export class TanstackStart extends Framework {
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

			transformViteConfig(projectPath, { viteEnvironmentName: "ssr" });
		}

		return {
			wranglerConfig: {
				main: "@tanstack/react-start/server-entry",
			},
		};
	}

	configurationDescription = "Configuring project for Tanstack Start";
}
