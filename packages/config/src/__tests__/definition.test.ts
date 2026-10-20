import assert from "node:assert";
import { fileURLToPath } from "node:url";
import {
	getTokenAtPosition,
	isObjectLiteralExpression,
	isPropertyAssignment,
	ScriptTarget,
} from "tsrs/unstable/ast";
import { createFileSystemLayer } from "tsrs/unstable/fs";
import { API, ModuleKind, ModuleResolutionKind } from "tsrs/unstable/sync";
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
	using api = new API();
	using snapshot = api.createSnapshot({
		fileSystem: createFileSystemLayer([[testFilePath, source]]),
		createPrograms: [
			{
				rootFiles: [testFilePath],
				compilerOptions: {
					module: ModuleKind.ESNext,
					moduleResolution: ModuleResolutionKind.Bundler,
					strict: true,
					target: ScriptTarget.ESNext,
				},
			},
		],
	});
	const [project] = snapshot.getProjects();
	assert(project);
	expect(project.program.getSemanticDiagnostics(testFilePath)).toEqual([]);
	const sourceFile = project.program.getSourceFile(testFilePath);
	assert(sourceFile);

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
		['image: { dockerfile: "./Dockerfile" }', "The image to build or deploy."],
		['dockerfile: "./Dockerfile"', "The path to a Dockerfile."],
	] as const) {
		const token = getTokenAtPosition(sourceFile, source.indexOf(marker));
		assert(isPropertyAssignment(token.parent));
		const object = token.parent.parent;
		assert(isObjectLiteralExpression(object));
		// Hover documentation comes from the contextual type's properties.
		const contextualType = project.checker.getContextualType(object);
		const symbol = contextualType?.getProperty(
			marker.slice(0, marker.indexOf(":"))
		);
		expect(symbol?.getDocumentationComment(project.checker), marker).toContain(
			expectedDocumentation
		);
	}
}, 10_000);
