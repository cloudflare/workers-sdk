import path from "node:path";
import { migrateWranglerToCf as migrate } from "@cloudflare/autoconfig";
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
	force?: boolean;
}

/**
 * Migrates a Wrangler configuration to cf configuration, refusing to write into a Git
 * worktree with uncommitted changes unless `force` is set.
 *
 * @param configPath Path to a Wrangler JSON, JSONC, or TOML configuration file.
 * @param options Optional bundler selection and write-safety controls.
 *
 * @returns Generated file paths and any follow-up work left for the caller.
 */
export async function migrateWranglerToCf(
	configPath: string,
	{ force = false, ...options }: WranglerToCfMigrationOptions = {}
): Promise<WranglerToCfMigrationResult> {
	if (!options.dryRun) {
		await ensureCleanGitWorktree(path.dirname(path.resolve(configPath)), force);
	}
	return migrate(configPath, options);
}
