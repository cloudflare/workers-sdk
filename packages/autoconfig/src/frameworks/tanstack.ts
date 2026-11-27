import { Framework } from "./framework-class";
import { transformViteConfig } from "./utils/vite-config";
import { getCloudflareVitePluginDependencies } from "./utils/vite-plugin";
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
		target,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (!dryRun) {
			transformViteConfig(projectPath, { viteEnvironmentName: "ssr" });
		}

		return {
			buildTool: "vite",
			workerConfig: {
				entrypoint: "@tanstack/react-start/server-entry",
			},
			dependencies: getCloudflareVitePluginDependencies({
				projectPath,
				target,
			}),
		};
	}

	configurationDescription = "Configuring project for Tanstack Start";
}
