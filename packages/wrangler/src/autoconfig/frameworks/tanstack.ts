import { brandColor, dim } from "@cloudflare/cli/colors";
import { installPackages } from "../c3-vendor/packages";
import { transformViteConfig } from "./utils/vite-config";
import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";

export class TanstackStart extends Framework {
	async configure({
		dryRun,
		projectPath,
		packageManager,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (!dryRun) {
			await installPackages(packageManager, ["@cloudflare/vite-plugin"], {
				dev: true,
				startText: "Installing the Cloudflare Vite plugin",
				doneText: `${brandColor(`installed`)} ${dim("@cloudflare/vite-plugin")}`,
			});

			transformViteConfig(projectPath, { viteEnvironmentName: "ssr" });
		}

		return {
			wranglerConfig: {
				compatibility_flags: ["nodejs_compat"],
				main: "@tanstack/react-start/server-entry",
			},
		};
	}

	configurationDescription = "Configuring project for Tanstack Start";
}
