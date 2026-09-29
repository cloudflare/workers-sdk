import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, it } from "vitest";
import { convertWranglerConfig } from "../src/codemods/wrangler-to-cf/config-converter";
import { renderCloudflareConfig } from "../src/codemods/wrangler-to-cf/config-renderer";

function compileConfig(source: string): string[] {
	const fileName = fileURLToPath(
		new URL("./generated-config.ts", import.meta.url)
	);
	const options: ts.CompilerOptions = {
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		target: ts.ScriptTarget.ESNext,
		strict: true,
		noEmit: true,
		skipLibCheck: true,
		types: [],
	};
	const host = ts.createCompilerHost(options);
	const getSourceFile = host.getSourceFile.bind(host);
	host.getSourceFile = (
		name,
		languageVersion,
		onError,
		shouldCreateNewSourceFile
	) =>
		name === fileName
			? ts.createSourceFile(name, source, languageVersion, true)
			: getSourceFile(
					name,
					languageVersion,
					onError,
					shouldCreateNewSourceFile
				);
	// cf re-exports this public surface. Resolve its actual declarations without
	// installing the published CLI or substituting a simplified test definition.
	host.resolveModuleNameLiterals = (names, containingFile) =>
		names.map((name) =>
			ts.resolveModuleName(
				name.text === "cf/config" ? "@cloudflare/config/public" : name.text,
				containingFile,
				options,
				host
			)
		);
	const program = ts.createProgram([fileName], options, host);
	return ts
		.getPreEmitDiagnostics(program)
		.map((diagnostic) =>
			ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
		);
}

function render(source: Record<string, unknown>): string {
	return renderCloudflareConfig(
		convertWranglerConfig(
			{
				name: "example-worker",
				compatibility_date: "2026-09-23",
				...source,
			},
			"vite",
			[]
		)
	);
}

describe("generated configuration types", () => {
	it.for([
		{
			label: "disjoint binding names",
			vars: { BASE_ONLY: "base" },
			env: { staging: { vars: { STAGING_ONLY: "staging" } } },
		},
		{
			label: "an empty environment binding map",
			vars: { BASE_ONLY: "base" },
			env: { staging: { vars: {} } },
		},
		{
			label: "an empty base binding map",
			vars: {},
			env: { staging: { vars: { STAGING_ONLY: "staging" } } },
		},
		{
			label: "multiple modes and Preview branches",
			vars: { BASE_ONLY: "base" },
			previews: { vars: { BASE_PREVIEW: "preview" } },
			env: {
				staging: {
					vars: { STAGING_ONLY: "staging" },
					previews: { vars: { STAGING_PREVIEW: "preview" } },
				},
				production: { vars: { PRODUCTION_ONLY: "production" } },
				empty: { vars: {} },
			},
		},
		{
			label: "Preview without modes",
			vars: { BASE_ONLY: "base" },
			previews: { vars: { PREVIEW_ONLY: "preview" } },
		},
	])("compiles $label", ({ label: _label, ...source }, { expect }) => {
		expect(compileConfig(render(source))).toEqual([]);
	});

	it("still rejects invalid callback return values", ({ expect }) => {
		const source = render({ env: { staging: { vars: { MODE: "staging" } } } });
		const invalid = source.replaceAll('name: "example-worker"', "name: 123");
		expect(invalid).not.toBe(source);
		expect(compileConfig(invalid).join("\n")).toContain(
			"Type 'number' is not assignable to type 'string'."
		);
	});
});
