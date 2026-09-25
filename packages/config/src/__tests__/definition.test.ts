import { fileURLToPath } from "node:url";
import ts from "typescript";
import { it } from "vitest";

const source = `
import { defineConfig, defineContainer, defineWorker } from "../definition";

defineConfig({
	worker: {
		name: "inline-worker",
		compatibilityDate: "2026-09-25",
	},
	containers: [
		{
			name: "inline-container",
			image: { dockerfile: "./inline.Dockerfile" },
		},
	],
});

defineWorker({
	name: "standalone-worker",
	compatibilityDate: "2026-09-25",
});

defineContainer({
	name: "standalone-container",
	image: { dockerfile: "./Dockerfile" },
});
`;
const testFilePath = fileURLToPath(
	new URL("inline-worker-jsdoc.ts", import.meta.url)
);

it("preserves JSDoc for define helper fields", ({ expect }) => {
	const host: ts.LanguageServiceHost = {
		...ts.sys,
		getCompilationSettings: () => ({
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			strict: true,
			target: ts.ScriptTarget.ESNext,
		}),
		getDefaultLibFileName: ts.getDefaultLibFilePath,
		getScriptFileNames: () => [testFilePath],
		getScriptSnapshot: (fileName) => {
			const contents =
				fileName === testFilePath ? source : ts.sys.readFile(fileName);
			return contents === undefined
				? undefined
				: ts.ScriptSnapshot.fromString(contents);
		},
		getScriptVersion: () => "0",
		useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
	};
	const languageService = ts.createLanguageService(host);

	try {
		expect(languageService.getSemanticDiagnostics(testFilePath)).toEqual([]);

		for (const [marker, expectedDocumentation] of [
			['name: "inline-worker"', "The name of your Worker."],
			[
				'compatibilityDate: "2026-09-25"',
				"which version of the Workers runtime is used.",
			],
			['name: "inline-container"', "Name of the application."],
			[
				'image: { dockerfile: "./inline.Dockerfile" }',
				"The image to build or deploy.",
			],
			['dockerfile: "./inline.Dockerfile"', "The path to a Dockerfile."],
			['name: "standalone-worker"', "The name of your Worker."],
			['name: "standalone-container"', "Name of the application."],
			[
				'image: { dockerfile: "./Dockerfile" }',
				"The image to build or deploy.",
			],
			['dockerfile: "./Dockerfile"', "The path to a Dockerfile."],
		] as const) {
			const info = languageService.getQuickInfoAtPosition(
				testFilePath,
				source.indexOf(marker)
			);
			expect(ts.displayPartsToString(info?.documentation), marker).toContain(
				expectedDocumentation
			);
		}
	} finally {
		languageService.dispose();
	}
});
