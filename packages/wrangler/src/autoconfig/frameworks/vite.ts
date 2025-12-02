import { brandColor, dim } from "@cloudflare/cli/colors";
import { installPackages } from "../c3-vendor/packages";
import { transformViteConfig } from "./utils";
import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";

export class Vite extends Framework {
	async configure({
		dryRun,
		outputDir,
		projectPath,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (!dryRun) {
			await installPackages(["@cloudflare/vite-plugin"], {
				dev: true,
				startText: "Installing the Cloudflare Vite plugin",
				doneText: `${brandColor(`installed`)} ${dim("@cloudflare/vite-plugin")}`,
			});

			transformViteConfig(projectPath);
		}

		return {
			wranglerConfig: {
				assets: {
					directory: outputDir,
				},
			},
		};
	}
}
