import path from "node:path";
import { getDetailsForAutoConfig, runAutoConfig } from "@cloudflare/autoconfig";
import { fileExists, filterByFileRestrictions } from "../../files";
import type { Codemod, CodemodContext } from "../../types";
import type { AutoConfigContext } from "@cloudflare/autoconfig";

const DEFAULT_CONFIG_FILES = [
	"wrangler.json",
	"wrangler.jsonc",
	"wrangler.toml",
] as const;

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
		confirm: async (_text, options) => options?.defaultValue ?? true,
		prompt: async (_text, options) => options?.defaultValue ?? "",
		select: async (_text, options) =>
			options.choices[options.defaultOption ?? 0]?.value ?? "",
	},
	runCommand: () => {
		throw new Error("The wrangler-to-cf codemod doesn't build the project.");
	},
};

async function getConfigPath(context: CodemodContext): Promise<string> {
	if (context.configPath) {
		return path.resolve(context.cwd, context.configPath);
	}

	const candidates = DEFAULT_CONFIG_FILES.map((fileName) =>
		path.join(context.cwd, fileName)
	);
	const existingCandidates = (
		await Promise.all(
			candidates.map(async (candidate) => ({
				candidate,
				exists: await fileExists(candidate),
			}))
		)
	)
		.filter(({ exists }) => exists)
		.map(({ candidate }) => candidate);

	if (existingCandidates.length === 1) {
		return existingCandidates[0];
	}
	if (existingCandidates.length === 0) {
		throw new Error(
			`No Wrangler config found in ${context.cwd}. Pass --config with the exact config path.`
		);
	}

	throw new Error(
		`Multiple Wrangler configs found in ${context.cwd}. Pass --config with the exact config path.`
	);
}

export const wranglerToCfCodemod: Codemod = {
	name: "wrangler-to-cf",
	aliases: ["wrangler to cf"],
	description: `Migrate a Wrangler project to cf, including its configuration and framework`,
	managesGitWorktreeSafety: true,
	run: async (context) => {
		const configPath = await getConfigPath(context);
		const [includedConfigPath] = await filterByFileRestrictions(context, [
			configPath,
		]);
		if (!includedConfigPath) {
			return {
				changedFiles: [],
				message: `${path
					.relative(context.cwd, configPath)
					.split(path.sep)
					.join(path.posix.sep)} does not match any --files pattern.`,
				status: "skipped",
			};
		}

		const details = await getDetailsForAutoConfig({
			projectPath: context.cwd,
			wranglerConfigPath: includedConfigPath,
			target: "cf",
			context: autoConfigContext,
		});
		if (details.configured) {
			throw new Error(
				`Cannot migrate because ${path.join(context.cwd, "cloudflare.config.ts")} already exists. Inspect and finish the existing migration; it will not be overwritten. Automated agents should read its TODOs and ask the user about unresolved choices.`
			);
		}
		const { wranglerMigration } = await runAutoConfig(details, {
			target: "cf",
			context: autoConfigContext,
			dryRun: context.dryRun,
			skipConfirmations: true,
			runBuild: false,
			bundler: context.bundler,
			requireCleanGitWorktree: !context.force,
			enableTargetCliInstallation: context.installDependencies,
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
