import assert from "node:assert";
import { writeFileSync } from "node:fs";
import { brandColor, dim } from "@cloudflare/cli/colors";
import semiver from "semiver";
import { runCommand } from "../c3-vendor/command";
import { getInstalledPackageVersion } from "./utils/packages";
import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";

export class Astro extends Framework {
	async configure({
		outputDir,
		dryRun,
		packageManager,
		projectPath,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		const astroVersion = getAstroVersion(projectPath);

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

		if (semiver(astroVersion, "6.0.0") < 0) {
			// Before version 6 Astro required a wrangler config file
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

		// From version 6 Astro doesn't need a wrangler config file but generates a redirected config on build
		return {
			wranglerConfig: null,
		};
	}

	configurationDescription =
		'Configuring project for Astro with "astro add cloudflare"';
}

/**
 * Gets the installed version of the "astro" package
 * @param projectPath The path of the project
 */
function getAstroVersion(projectPath: string): string {
	const packageName = "astro";
	const astroVersion = getInstalledPackageVersion(packageName, projectPath);

	assert(
		astroVersion,
		`Unable to discern the version of the \`${packageName}\` package`
	);

	return astroVersion;
}
