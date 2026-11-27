import {
	migrateBundler,
	migrateWranglerConfig,
} from "../../src/wrangler-config/migrate";
import type {
	BundlerMigrationOptions,
	MigrationResult,
} from "../../src/wrangler-config/types";

/**
 * Runs both migration steps and combines their results, as the codemod does.
 *
 * @param configPath Path to the Wrangler configuration file.
 * @param options The bundler migration options; `dryRun` applies to both steps.
 *
 * @returns The combined migration result.
 */
export async function migrate(
	configPath: string,
	options: BundlerMigrationOptions = {}
): Promise<MigrationResult> {
	const settings = await migrateWranglerConfig(configPath, {
		dryRun: options.dryRun,
	});
	const build = await migrateBundler(configPath, options);

	return {
		...build,
		changedFiles: [
			...new Set([...settings.changedFiles, ...build.changedFiles]),
		],
		followUps: [...settings.followUps, ...build.followUps],
		status: settings.status === "complete" ? build.status : settings.status,
	};
}
