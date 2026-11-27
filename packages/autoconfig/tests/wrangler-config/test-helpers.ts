import ts from "typescript";
import {
	migrateBundler,
	migrateWranglerConfig,
} from "../../src/wrangler-config/migrate";
import type {
	BundlerMigrationOptions,
	MigrationResult,
} from "../../src/wrangler-config/types";

/**
 * Returns syntax errors produced when TypeScript transpiles a generated config.
 *
 * @param source Generated TypeScript configuration source.
 *
 * @returns Flattened TypeScript error messages.
 */
export function getSyntaxErrors(source: string): string[] {
	return (
		ts.transpileModule(source, {
			compilerOptions: {
				module: ts.ModuleKind.ESNext,
				target: ts.ScriptTarget.ESNext,
			},
			fileName: "cloudflare.config.ts",
			reportDiagnostics: true,
		}).diagnostics ?? []
	)
		.filter(({ category }) => category === ts.DiagnosticCategory.Error)
		.map((diagnostic) =>
			ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
		);
}

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
	const followUps = [...settings.followUps, ...build.followUps];

	return {
		changedFiles: [
			...new Set([...settings.changedFiles, ...build.changedFiles]),
		],
		followUps,
		requiresInstall: build.requiresInstall,
		status: followUps.some(({ blocking }) => blocking)
			? "needs-intervention"
			: "complete",
	};
}
