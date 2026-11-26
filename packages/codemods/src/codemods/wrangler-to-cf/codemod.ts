import path from "node:path";
import { getDetailsForAutoConfig, runAutoConfig } from "@cloudflare/autoconfig";
import { ensureCleanGitWorktree } from "@cloudflare/cli-shared-helpers/git";
import { filterByFileRestrictions } from "../../files";
import type { Codemod } from "../../types";
import type { AutoConfigContext } from "@cloudflare/autoconfig";

/** Runs autoconfig without asking, since running the codemod is the request. */
const autoConfigContext: AutoConfigContext = {
	logger: {
		log: console.log,
		info: console.log,
		warn: console.warn,
		debug: () => {},
		error: console.error,
	},
	dialogs: {
		// Nobody answers, so answer as autoconfig does without a terminal
		confirm: async (_text, options) =>
			options?.fallbackValue ?? options?.defaultValue ?? true,
		prompt: async (_text, options) => options?.defaultValue ?? "",
		select: async (_text, options) =>
			options.choices[options.defaultOption ?? 0]?.value ?? "",
	},
	runCommand: () => {
		throw new Error("The wrangler-to-cf codemod doesn't build the project.");
	},
};

export const wranglerToCfCodemod: Codemod = {
	name: "wrangler-to-cf",
	aliases: ["wrangler to cf"],
	description: `Migrate a Wrangler project to cf, including its configuration and framework`,
	managesGitWorktreeSafety: true,
	run: async (context) => {
		const configPath =
			context.configPath === undefined
				? undefined
				: path.resolve(context.cwd, context.configPath);
		const details = await getDetailsForAutoConfig({
			// An exact Wrangler config is migrated in its own folder, as before
			projectPath:
				configPath === undefined ? context.cwd : path.dirname(configPath),
			wranglerConfigPath: configPath,
			target: "cf",
			context: autoConfigContext,
		});
		if (details.configured) {
			throw new Error(
				`Cannot migrate because ${path.join(details.projectPath, "cloudflare.config.ts")} already exists. Inspect and finish the existing migration; it will not be overwritten. Automated agents should read its TODOs and ask the user about unresolved choices.`
			);
		}
		if (details.wranglerConfigPath === undefined) {
			throw new Error(
				`No Wrangler config found in ${context.cwd}. Pass --config with the exact config path.`
			);
		}

		const [includedConfigPath] = await filterByFileRestrictions(context, [
			details.wranglerConfigPath,
		]);
		if (!includedConfigPath) {
			return {
				changedFiles: [],
				message: `${path
					.relative(context.cwd, details.wranglerConfigPath)
					.split(path.sep)
					.join(path.posix.sep)} does not match any --files pattern.`,
				status: "skipped",
			};
		}

		// Checked after the existing-migration check, so that a rerun reports the existing migration
		if (!context.dryRun) {
			await ensureCleanGitWorktree(
				details.projectPath,
				context.force ?? false,
				"Rerun with `--force` to bypass this safety check."
			);
		}

		const { wranglerMigration } = await runAutoConfig(details, {
			target: "cf",
			context: autoConfigContext,
			dryRun: context.dryRun,
			skipConfirmations: true,
			runBuild: false,
			bundler: context.bundler,
			installDependencies: context.installDependencies,
		});
		if (!wranglerMigration) {
			throw new Error("Autoconfig did not migrate the Wrangler config.");
		}

		return {
			...wranglerMigration,
			changedFiles: wranglerMigration.changedFiles.map((filePath) =>
				path
					.relative(
						context.cwd,
						path.join(path.dirname(includedConfigPath), filePath)
					)
					.split(path.sep)
					.join(path.posix.sep)
			),
		};
	},
};
