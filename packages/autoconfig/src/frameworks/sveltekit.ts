import { writeFileSync } from "node:fs";
import { brandColor, dim } from "@cloudflare/cli-shared-helpers/colors";
import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import { installPackages } from "@cloudflare/cli-shared-helpers/packages";
import { AutoConfigFrameworkConfigurationError } from "../errors";
import { Framework } from "./framework-class";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";

export class SvelteKit extends Framework {
	async configure({
		dryRun,
		packageManager,
		isWorkspaceRoot,
		target,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (target === "cf") {
			throw new AutoConfigFrameworkConfigurationError(
				`cf does not support automatic configuration for ${this.name} projects yet. You can still use Wrangler to develop and deploy this project.`,
				{ telemetryMessage: "autoconfig framework unsupported for cf" }
			);
		}

		const { dlx } = packageManager;
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
						`via \`${dlx.join(
							" "
						)} sv add sveltekit-adapter=adapter:cloudflare+cfTarget:workers\``
					)}`,
				}
			);
			writeFileSync("static/.assetsignore", "_worker.js\n_routes.json");

			await installPackages(packageManager.type, [], {
				startText: "Installing packages",
				doneText: `${brandColor("installed")}`,
				isWorkspaceRoot,
			});
		}
		return {
			buildTool: "wrangler",
			workerConfig: {
				entrypoint: ".svelte-kit/cloudflare/_worker.js",
				env: {
					ASSETS: { type: "assets" },
				},
			},
			buildConfig: { assetsDirectory: ".svelte-kit/cloudflare" },
		};
	}

	configurationDescription = 'Configuring project for SvelteKit with "sv add"';
}
