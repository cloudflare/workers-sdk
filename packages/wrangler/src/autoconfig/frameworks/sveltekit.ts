import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brandColor, dim } from "@cloudflare/cli-shared-helpers/colors";
import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import { installPackages } from "@cloudflare/cli-shared-helpers/packages";
import { Framework } from "./framework-class";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";

export class SvelteKit extends Framework {
	async configure({
		buildCommand,
		dryRun,
		packageManager,
		projectPath,
		isWorkspaceRoot,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
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
			wranglerConfig: {
				main: ".svelte-kit/cloudflare/_worker.js",
				assets: {
					binding: "ASSETS",
					directory: ".svelte-kit/cloudflare",
				},
			},
			...(buildCommand && hasTypeConfig(projectPath)
				? {
						buildCommandOverride: `${packageManager.npx} wrangler types && ${buildCommand}`,
					}
				: {}),
		};
	}

	configurationDescription = 'Configuring project for SvelteKit with "sv add"';
}

function hasTypeConfig(projectPath: string): boolean {
	return (
		existsSync(join(projectPath, "tsconfig.json")) ||
		existsSync(join(projectPath, "jsconfig.json"))
	);
}
