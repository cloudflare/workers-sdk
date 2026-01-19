import { brandColor, dim } from "@cloudflare/cli/colors";
import { getPackageManager } from "../../package-manager";
import { installPackages } from "../c3-vendor/packages";
import { transformViteConfig } from "./utils/vite-config";
import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";

export class TanstackStart extends Framework {
	async configure({
		dryRun,
		projectPath,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (!dryRun) {
			await installPackages(["@cloudflare/vite-plugin"], {
				dev: true,
				startText: "Installing the Cloudflare Vite plugin",
				doneText: `${brandColor(`installed`)} ${dim("@cloudflare/vite-plugin")}`,
			});

			transformViteConfig(projectPath, { viteEnvironmentName: "ssr" });
		}

		const { type: npm } = await getPackageManager();

		return {
			wranglerConfig: {
				compatibility_flags: ["nodejs_compat"],
				main: "@tanstack/react-start/server-entry",
			},
			buildCommand: `${npm} run build`,
		};
	}

	configurationDescription = "Configuring project for Tanstack Start";
}
