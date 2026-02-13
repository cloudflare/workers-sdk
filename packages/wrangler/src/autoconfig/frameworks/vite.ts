import { brandColor, dim } from "@cloudflare/cli/colors";
import { installPackages } from "../c3-vendor/packages";
import {
	checkIfViteConfigUsesCloudflarePlugin,
	transformViteConfig,
} from "./utils/vite-config";
import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";

export class Vite extends Framework {
	isConfigured(projectPath: string): boolean {
		return checkIfViteConfigUsesCloudflarePlugin(projectPath);
	}

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
