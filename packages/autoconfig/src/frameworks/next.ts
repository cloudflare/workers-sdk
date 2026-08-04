import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import { Framework } from "./framework-class";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";

export class NextJs extends Framework {
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
					"vinext",
					"init",
					"--platform=cloudflare",
					"--cdn-cache=workers-cache",
					"--data-cache=none",
					"--image-optimization=cloudflare-images",
					"--no-prerender",
					"--no-experimental-warm-cdn-cache",
				],
				{
					cwd: projectPath,
				}
			);
		}

		return {
			// `vinext init` creates the Wrangler and Vite configuration files.
			wranglerConfig: null,
			packageJsonScriptsOverrides: {
				preview:
					"vinext build && wrangler dev --config dist/server/wrangler.json",
				deploy: "vinext-cloudflare deploy --config dist/server/wrangler.json",
			},
			buildCommandOverride: `${npx} vinext build`,
			deployCommandOverride: `${npx} vinext-cloudflare deploy`,
			versionCommandOverride: `${npx} wrangler versions upload --config dist/server/wrangler.json`,
		};
	}

	configurationDescription =
		"Configuring project for Next.js with vinext by running `vinext init`";
}
