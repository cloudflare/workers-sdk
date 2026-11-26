import { Framework } from "./framework-class";
import { transformViteConfig } from "./utils/vite-config";
import { installCloudflareVitePlugin } from "./utils/vite-plugin";
import { CF_VITE_PLUGIN_VERSION_RANGE } from "./utils/vite-plugin-version";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";

export class TanstackStart extends Framework {
	readonly env = {
		CLOUDFLARE_VITE_FORCE_BUILD_OUTPUT: "true",
	} as const;

	async configure({
		dryRun,
		projectPath,
		packageManager,
		isWorkspaceRoot,
		target,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (!dryRun) {
			await installCloudflareVitePlugin({
				packageManager: packageManager.type,
				isWorkspaceRoot,
				projectPath,
				version: target === "cf" ? CF_VITE_PLUGIN_VERSION_RANGE : undefined,
			});

			transformViteConfig(projectPath, { viteEnvironmentName: "ssr" });
		}

		return {
			buildTool: "vite",
			workerConfig: {
				entrypoint: "@tanstack/react-start/server-entry",
			},
		};
	}

	configurationDescription = "Configuring project for Tanstack Start";
}
