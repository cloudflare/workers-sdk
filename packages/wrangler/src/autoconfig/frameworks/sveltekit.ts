import { writeFileSync } from "node:fs";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { getPackageManager } from "../../package-manager";
import { runCommand } from "../c3-vendor/command";
import { installPackages } from "../c3-vendor/packages";
import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";

export class SvelteKit extends Framework {
	async configure({
		dryRun,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		const { dlx } = await getPackageManager();
		if (!dryRun) {
			await runCommand(
				[
					...dlx,
					"sv",
					"add",
					"--no-install",
					"--no-git-check",
					"sveltekit-adapter=adapter:cloudflare+cfTarget:workers",
				],
				{
					silent: true,
					startText: "Installing adapter",
					doneText: `${brandColor("installed")} ${dim(
						`via \`${dlx.join(" ")} sv add sveltekit-adapter=adapter:cloudflare+cfTarget:workers\``
					)}`,
				}
			);
			writeFileSync("static/.assetsignore", "_worker.js\n_routes.json");

			await installPackages([], {
				startText: "Installing packages",
				doneText: `${brandColor("installed")}`,
			});
		}
		return {
			wranglerConfig: {
				main: ".svelte-kit/cloudflare/_worker.js",
				compatibility_flags: ["nodejs_als"],
				assets: {
					binding: "ASSETS",
					directory: ".svelte-kit/cloudflare",
				},
			},
		};
	}

	configurationDescription = 'Configuring project for SvelteKit with "sv add"';
}
