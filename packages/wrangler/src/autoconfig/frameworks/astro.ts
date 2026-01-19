import { writeFileSync } from "node:fs";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { getPackageManager } from "../../package-manager";
import { runCommand } from "../c3-vendor/command";
import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";

export class Astro extends Framework {
	async configure({
		outputDir,
		dryRun,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		const { type: npm, npx } = await getPackageManager();
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
				compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
				assets: {
					binding: "ASSETS",
					directory: outputDir,
				},
			},
			buildCommand: `${npm} run build`,
		};
	}

	configurationDescription =
		'Configuring project for Astro with "astro add cloudflare"';
}
