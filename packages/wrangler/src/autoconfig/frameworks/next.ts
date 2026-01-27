import { statSync } from "node:fs";
import semiver from "semiver";
import { getPackageManager } from "../../package-manager";
import { runCommand } from "../c3-vendor/command";
import { AutoConfigFrameworkConfigurationError } from "../errors";
import { usesTypescript } from "../uses-typescript";
import { getInstalledPackageVersion } from "./utils/packages";
import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";

export class NextJs extends Framework {
	async configure({
		dryRun,
		projectPath,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		const usesTs = usesTypescript(projectPath);

		const nextConfigPath = findNextConfigPath(usesTs);
		if (!nextConfigPath) {
			throw new AutoConfigFrameworkConfigurationError(
				"No Next.js configuration file could be detected."
			);
		}

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

		const { npx } = await getPackageManager();

		if (!dryRun) {
			await runCommand([
				npx,
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

function findNextConfigPath(usesTs: boolean): string | undefined {
	const pathsToCheck = [
		...(usesTs ? ["next.config.ts"] : []),
		"next.config.mjs",
		"next.config.js",
		"next.config.cjs",
	] as const;

	for (const path of pathsToCheck) {
		const stats = statSync(path, {
			throwIfNoEntry: false,
		});
		if (stats?.isFile()) {
			return path;
		}
	}
}
