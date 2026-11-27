import path from "node:path";
import { migrateBundler, migrateWranglerConfig } from "@cloudflare/autoconfig";
import { fileExists, filterByFileRestrictions } from "../files";
import { ensureCleanGitWorktree } from "../git";
import type { Codemod, CodemodContext } from "../types";
import type {
	BundlerMigrationOptions,
	MigrationResult,
} from "@cloudflare/autoconfig";

export type { MigrationFollowUp } from "@cloudflare/autoconfig";
export type WranglerToCfMigrationResult = MigrationResult;

export interface WranglerToCfMigrationOptions extends BundlerMigrationOptions {
	/** Whether to migrate even if the Git worktree is not clean */
	force?: boolean;
}

/**
 * Migrates one exact Wrangler configuration file to the new cf configuration.
 *
 * @param configPath Path to a Wrangler JSON, JSONC, or TOML configuration file.
 * @param options Optional bundler selection and write-safety controls.
 *
 * @returns Generated file paths and any follow-up work left for the caller.
 */
export async function migrateWranglerToCf(
	configPath: string,
	options: WranglerToCfMigrationOptions = {}
): Promise<WranglerToCfMigrationResult> {
	const { force = false, ...migrationOptions } = options;
	const absoluteConfigPath = path.resolve(configPath);
	const projectDirectory = path.dirname(absoluteConfigPath);
	// The migration reports an existing cloudflare.config.ts itself, so a rerun explains why it stopped
	if (
		!migrationOptions.dryRun &&
		!(await fileExists(path.join(projectDirectory, "cloudflare.config.ts")))
	) {
		await ensureCleanGitWorktree(projectDirectory, force);
	}

	const settings = await migrateWranglerConfig(absoluteConfigPath, {
		dryRun: migrationOptions.dryRun,
	});
	const build = await migrateBundler(absoluteConfigPath, migrationOptions);

	return {
		...build,
		changedFiles: [
			...new Set([...settings.changedFiles, ...build.changedFiles]),
		],
		followUps: [...settings.followUps, ...build.followUps],
		status: settings.status === "complete" ? build.status : settings.status,
	};
}

const DEFAULT_CONFIG_FILES = [
	"wrangler.json",
	"wrangler.jsonc",
	"wrangler.toml",
] as const;

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
	description: `Migrate a Wrangler configuration to the cf configuration format`,
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

		const result = await migrateWranglerToCf(includedConfigPath, {
			bundler: context.bundler,
			dryRun: context.dryRun,
			force: context.force,
			installDependencies: context.installDependencies,
		});

		return {
			...result,
			changedFiles: result.changedFiles.map((filePath) =>
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
