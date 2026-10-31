import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import semiver from "semiver";
import { Framework } from "./framework-class";
import type { AutoConfigTarget } from "../context";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";

// vinext does not support Next.js versions before 16, so those projects keep using OpenNext.
// Later majors also use vinext rather than falling back to OpenNext, whose output cf does not deploy.
const VINEXT_MINIMUM_NEXT_VERSION = "16.0.0";

// `--name` requires vinext 1.2.0 or later
const VINEXT_PACKAGE = "vinext@^1.3.0";

const OPENNEXT_CONFIGURATION_DESCRIPTION =
	"Configuring project for Next.js with OpenNext by running `@opennextjs/cloudflare migrate`";
const VINEXT_CONFIGURATION_DESCRIPTION =
	"Configuring project for Next.js with vinext by running `vinext init`";

export class NextJs extends Framework {
	async configure(
		options: ConfigurationOptions
	): Promise<ConfigurationResults> {
		// The summary displays this description after the dry run, so it names the tool that will run
		if (this.shouldUseVinext(options.target)) {
			this.configurationDescription = VINEXT_CONFIGURATION_DESCRIPTION;
			return configureWithVinext(options);
		}

		this.configurationDescription = OPENNEXT_CONFIGURATION_DESCRIPTION;
		return configureWithOpenNext(options);
	}

	configurationDescription = OPENNEXT_CONFIGURATION_DESCRIPTION;

	/**
	 * Determines whether the project should be configured with vinext rather than OpenNext.
	 *
	 * vinext builds the project with the Cloudflare Vite plugin, producing the Build Output
	 * that cf deploys, so it is used for the cf target whenever the project's Next.js version
	 * supports it.
	 *
	 * @param target The autoconfig target
	 * @returns `true` if the project should be configured with vinext
	 */
	private shouldUseVinext(target: AutoConfigTarget): boolean {
		return (
			target === "cf" &&
			semiver(this.frameworkVersion, VINEXT_MINIMUM_NEXT_VERSION) >= 0
		);
	}
}

/**
 * Configures a Next.js project to run on Vite with vinext by running `vinext init`.
 *
 * @param options The configuration options
 * @returns The configuration results
 */
async function configureWithVinext({
	dryRun,
	projectPath,
	workerName,
	packageManager,
}: ConfigurationOptions): Promise<ConfigurationResults> {
	const { npx, dlx } = packageManager;

	if (!dryRun) {
		await runCommand(
			[
				...dlx,
				VINEXT_PACKAGE,
				"init",
				// `vinext init` prompts for these choices and fails in agent environments
				// when they are missing, so we pass the defaults it uses when non-interactive
				"--platform=cloudflare",
				"--cdn-cache=none",
				"--image-optimization=cloudflare-images",
				// Cloudflare only serves pre-rendered routes when using the Static Assets cache
				"--no-prerender",
				// Without `--name`, vinext derives the Worker name from package.json, ignoring the
				// name chosen during autoconfig (including `WRANGLER_CI_OVERRIDE_NAME`)
				`--name=${workerName}`,
			],
			{
				cwd: projectPath,
			}
		);
	}

	return {
		buildTool: "vite",
		// `vinext init` creates the cloudflare.config.ts file
		workerConfig: null,
		buildCommandOverride: `${npx} vite build`,
	};
}

/**
 * Configures a Next.js project with OpenNext by running `@opennextjs/cloudflare migrate`.
 *
 * @param options The configuration options
 * @returns The configuration results
 */
async function configureWithOpenNext({
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
		buildCommandOverride: `${npx} opennextjs-cloudflare build`,
		deployCommandOverride: `${npx} opennextjs-cloudflare deploy`,
		versionCommandOverride: `${npx} opennextjs-cloudflare upload`,
	};
}
