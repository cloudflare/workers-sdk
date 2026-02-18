import { writeFileSync } from "node:fs";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { runCommand } from "../c3-vendor/command";
import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";

export class Astro extends Framework {
	async configure({
		outputDir,
		dryRun,
		packageManager,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		const { npx } = packageManager;
		if (!dryRun) {
			await runCommand([npx, "astro", "add", "cloudflare", "-y"], {
				silent: true,
				startText: "Installing adapter",
				doneText: `${brandColor("installed")} ${dim(
					`via \`${npx} astro add cloudflare\``
				)}`,
			});
			writeFileSync("public/.assetsignore", "_worker.js\n_routes.json");
		}
		return {
			wranglerConfig: {
				main: `${outputDir}/_worker.js/index.js`,
				compatibility_flags: ["global_fetch_strictly_public"],
				assets: {
					binding: "ASSETS",
					directory: outputDir,
				},
			},
		};
	}

	configurationDescription =
		'Configuring project for Astro with "astro add cloudflare"';
}
