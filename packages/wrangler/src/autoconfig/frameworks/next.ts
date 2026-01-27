import semiver from "semiver";
import { getPackageManager } from "../../package-manager";
import { runCommand } from "../c3-vendor/command";
import { AutoConfigFrameworkConfigurationError } from "../errors";
import { getInstalledPackageVersion } from "./utils/packages";
import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";

export class NextJs extends Framework {
	async configure({
		dryRun,
		projectPath,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		const firstNextVersionSupportedByOpenNext = "14.2.35";
		const installedNextVersion = getInstalledPackageVersion(
			"next",
			projectPath
		);

		if (
			installedNextVersion &&
			semiver(installedNextVersion, firstNextVersionSupportedByOpenNext) < 0
		) {
			throw new AutoConfigFrameworkConfigurationError(
				`The detected Next.js version (${installedNextVersion}) is too old, please update the \`next\` dependency to at least ${firstNextVersionSupportedByOpenNext} and try again.`
			);
		}

		const { npx, dlx } = await getPackageManager();

		if (!dryRun) {
			await runCommand([
				...dlx,
				"@opennextjs/cloudflare",
				"migrate",
				// Note: we force-install so that even if an incompatible version of
				//       Next.js is used this installation still succeeds, moving users to
				//       (hopefully) the right direction (instead of failing at this step)
				"--force-install",
			]);
		}

		return {
			// `@opennextjs/cloudflare migrate` creates the wrangler config file
			wranglerConfig: null,
			packageJsonScriptsOverrides: {
				preview: "opennextjs-cloudflare build && opennextjs-cloudflare preview",
				deploy: "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
			},
			buildCommand: `${npx} @opennextjs/cloudflare build`,
		};
	}

	configurationDescription =
		"Configuring project for Next.js with OpenNext by running `@opennextjs/cloudflare migrate`";
}
