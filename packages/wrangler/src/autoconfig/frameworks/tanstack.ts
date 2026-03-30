import { brandColor, dim } from "@cloudflare/cli/colors";
import { installPackages } from "@cloudflare/cli/packages";
import { Framework } from "./framework-class";
import { transformViteConfig } from "./utils/vite-config";
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
			await installPackages(packageManager.type, ["@cloudflare/vite-plugin"], {
				dev: true,
				startText: "Installing the Cloudflare Vite plugin",
				doneText: `${brandColor(`installed`)} ${dim(
					"@cloudflare/vite-plugin"
				)}`,
				isWorkspaceRoot,
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
