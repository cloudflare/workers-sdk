import { statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import semiver from "semiver";
import { getPackageManager } from "../../package-manager";
import { dedent } from "../../utils/dedent";
import { installPackages } from "../c3-vendor/packages";
import { AutoConfigFrameworkConfigurationError } from "../errors";
import { appendToGitIgnore } from "../git";
import { usesTypescript } from "../uses-typescript";
import { getInstalledPackageVersion } from "./utils/packages";
import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";

export class NextJs extends Framework {
	async configure({
		dryRun,
		workerName,
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

		if (!dryRun) {
			await installPackages(["@opennextjs/cloudflare@^1.12.0"], {
				startText: "Installing @opennextjs/cloudflare adapter",
				doneText: `${brandColor("installed")}`,
				// Note: we force install open-next so that even if an incompatible version of
				//       Next.js is used this installation still succeeds, moving users to
				//       (hopefully) the right direction (instead of failing at this step)
				force: true,
			});

			await updateNextConfig(nextConfigPath);

			await createOpenNextConfigFile(projectPath);

			await appendToGitIgnore(
				projectPath,
				dedent`
				# OpenNext
				.open-next
				`,
				{
					startText: "Adding open-next section to .gitignore file",
					doneText: `${brandColor(`added`)} open-next section to .gitignore file`,
				}
			);
		}

		const { npx } = await getPackageManager();

		return {
			wranglerConfig: {
				main: ".open-next/worker.js",
				compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
				assets: {
					binding: "ASSETS",
					directory: ".open-next/assets",
				},
				services: [
					{
						binding: "WORKER_SELF_REFERENCE",
						service: workerName,
					},
				],
			},
			packageJsonScriptsOverrides: {
				preview: "opennextjs-cloudflare build && opennextjs-cloudflare preview",
				deploy: "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
			},
			buildCommandOverride: `${npx} @opennextjs/cloudflare build`,
			deployCommandOverride: `${npx} @opennextjs/cloudflare deploy`,
		};
	}

	configurationDescription = "Configuring project for Next.js with OpenNext";
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

async function updateNextConfig(nextConfigPath: string) {
	const s = spinner();

	s.start(`Updating \`${nextConfigPath}\``);

	const configContent = await readFile(nextConfigPath);

	const updatedConfigFile =
		configContent +
		"\n\nimport('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());\n";

	await writeFile(nextConfigPath, updatedConfigFile);

	s.stop(`${brandColor(`updated`)} ${dim(`\`${nextConfigPath}\``)}`);
}

async function createOpenNextConfigFile(projectPath: string) {
	const s = spinner();

	s.start("Creating open-next.config.ts file");

	await writeFile(
		// TODO: this always saves the file as open-next.config.ts, is a js alternative also supported?
		//       (since the project might not be using TypeScript)
		`${projectPath}/open-next.config.ts`,
		dedent`import { defineCloudflareConfig } from "@opennextjs/cloudflare";

				export default defineCloudflareConfig({
				// Uncomment to enable R2 cache,
				// It should be imported as:
				// \`import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";\`
				// See https://opennext.js.org/cloudflare/caching for more details
				// incrementalCache: r2IncrementalCache,
				});
			`
	);

	s.stop(`${brandColor("created")} open-next.config.ts file`);
}
