import { brandColor, dim } from "@cloudflare/cli-shared-helpers/colors";
import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import { installPackages } from "@cloudflare/cli-shared-helpers/packages";
import { Framework } from "./framework-class";
import type {
	ConfigurationOptions,
	ConfigurationResults,
	FrameworkVersionUpgradeOptions,
} from "./framework-class";

export class NextJs extends Framework {
	async upgradeFrameworkVersion({
		upgradeTo,
		packageManager,
		isWorkspaceRoot,
	}: FrameworkVersionUpgradeOptions): Promise<void> {
		await installPackages(packageManager.type, [`next@${upgradeTo}`], {
			isWorkspaceRoot,
			startText: `Updating Next.js to ${upgradeTo}`,
			doneText: `${brandColor("updated")} ${dim(`Next.js to ${upgradeTo}`)}`,
		});
	}

	async configure({
		dryRun,
		projectPath,
		packageManager,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		const { npx, dlx } = packageManager;

		if (!dryRun) {
			await runCommand([...dlx, "@opennextjs/cloudflare", "migrate"], {
				cwd: projectPath,
			});
		}

		return {
			// `@opennextjs/cloudflare migrate` creates the wrangler config file
			wranglerConfig: {},
			packageJsonScriptsOverrides: {
				preview: "opennextjs-cloudflare build && opennextjs-cloudflare preview",
				deploy: "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
			},
			buildCommandOverride: `${npx} opennextjs-cloudflare build`,
			deployCommandOverride: `${npx} opennextjs-cloudflare deploy`,
			versionCommandOverride: `${npx} opennextjs-cloudflare upload`,
		};
	}

	configurationDescription =
		"Configuring project for Next.js with OpenNext by running `@opennextjs/cloudflare migrate`";
}
