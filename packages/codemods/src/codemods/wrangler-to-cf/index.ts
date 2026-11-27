import path from "node:path";
import {
	migrateWranglerToCf as migrateWranglerConfigFile,
	readWranglerConfig,
} from "@cloudflare/autoconfig";
import { fileExists } from "../../files";
import { ensureCleanGitWorktree } from "../../git";
import type {
	WranglerToCfMigrationOptions as MigrationOptions,
	WranglerToCfMigrationResult,
} from "@cloudflare/autoconfig";

export type {
	MigrationFollowUp,
	WranglerToCfMigrationResult,
} from "@cloudflare/autoconfig";

export interface WranglerToCfMigrationOptions extends MigrationOptions {
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

	return migrateWranglerConfigFile(
		{
			path: absoluteConfigPath,
			content: readWranglerConfig(absoluteConfigPath),
		},
		migrationOptions
	);
}
