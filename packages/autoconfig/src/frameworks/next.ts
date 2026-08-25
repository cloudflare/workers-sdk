import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import { Framework } from "./framework-class";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";
import type { PackageManager } from "@cloudflare/workers-utils";

export class NextJs extends Framework {
	getBuildCommandOverride(packageManager: PackageManager): string {
		return `${packageManager.npx} opennextjs-cloudflare build`;
	}

	async configure({
		dryRun,
		projectPath,
		packageManager,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		const { npx, dlx } = packageManager;

		if (!dryRun) {
			await runCommand(
				[
					...dlx,
					"@opennextjs/cloudflare",
					"migrate",
					// Note: we force-install so that even if an incompatible version of
					//       Next.js is used this installation still succeeds, moving users
					//       (hopefully) in right direction (instead of failing at this step)
					"--force-install",
				],
				{
					cwd: projectPath,
				}
			);
		}

		return {
			// `@opennextjs/cloudflare migrate` creates the wrangler config file
			workerConfig: {},
			packageJsonScriptsOverrides: {
				preview: "opennextjs-cloudflare build && opennextjs-cloudflare preview",
				deploy: "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
			},
			buildCommandOverride: this.getBuildCommandOverride(packageManager),
			deployCommandOverride: `${npx} opennextjs-cloudflare deploy`,
			versionCommandOverride: `${npx} opennextjs-cloudflare upload`,
		};
	}

	configurationDescription =
		"Configuring project for Next.js with OpenNext by running `@opennextjs/cloudflare migrate`";
}
