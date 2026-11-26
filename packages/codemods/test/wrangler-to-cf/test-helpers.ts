import ts from "typescript";

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
