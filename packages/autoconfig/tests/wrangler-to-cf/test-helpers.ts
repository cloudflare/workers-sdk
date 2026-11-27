import ts from "typescript";
import { migrateWranglerToCf } from "../../src/wrangler-to-cf";
import { readWranglerConfig } from "../../src/wrangler-to-cf/config-reader";
import type { WranglerToCfMigrationOptions } from "../../src/wrangler-to-cf";

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
 * Reads a Wrangler config and migrates it, as setup does with the config that detection read.
 *
 * @param configPath Path to the Wrangler config to migrate.
 * @param options The migration options.
 *
 * @returns The migration result.
 */
export async function migrateWranglerConfig(
	configPath: string,
	options?: WranglerToCfMigrationOptions
) {
	return migrateWranglerToCf(
		{ path: configPath, content: readWranglerConfig(configPath) },
		options
	);
}
