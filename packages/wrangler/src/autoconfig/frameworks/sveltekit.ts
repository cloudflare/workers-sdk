import { writeFileSync } from "fs";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { getPackageManager } from "../../package-manager";
import { runCommand } from "../c3-vendor/command";
import { installPackages } from "../c3-vendor/packages";
import { Framework } from ".";
import type { ConfigurationOptions } from ".";
import type { RawConfig } from "@cloudflare/workers-utils";

export class SvelteKit extends Framework {
	name = "svelte-kit";

	async configure({ dryRun }: ConfigurationOptions): Promise<RawConfig> {
		const { dlx } = await getPackageManager();
		if (!dryRun) {
			await runCommand(
				[
					...dlx,
					"sv",
					"add",
					"--no-install",
					"sveltekit-adapter=adapter:cloudflare",
				],
				{
					silent: true,
					startText: "Installing adapter",
					doneText: `${brandColor("installed")} ${dim(
						`via \`${dlx} sv add sveltekit-adapter=adapter:cloudflare\``
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
			main: ".svelte-kit/cloudflare/_worker.js",
			compatibility_flags: ["nodejs_als"],
			assets: {
				binding: "ASSETS",
				directory: ".svelte-kit/cloudflare",
			},
		};
	}

	configurationDescription = 'Configuring project for SvelteKit with "sv add"';
}
