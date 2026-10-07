import { copyFile, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { removeDir } from "@cloudflare/workers-utils";
import ts from "typescript";
import { test } from "vitest";
import packageJson from "../package.json";
import { useTmp } from "./test-shared";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));

test("built public declarations resolve without private workspace imports", async ({
	expect,
}) => {
	const declarations = path.join(packageRoot, "dist/src/index.d.ts");
	const content = await readFile(declarations, "utf8");
	const privatePackages = Object.entries(packageJson.devDependencies)
		.filter(([, version]) => version.startsWith("workspace:"))
		.map(([name]) => name);
	const imports = ts.preProcessFile(content).importedFiles;
	expect(
		imports.filter(
			({ fileName }) =>
				fileName.startsWith(".") ||
				privatePackages.some(
					(name) => fileName === name || fileName.startsWith(`${name}/`)
				)
		)
	).toEqual([]);

	const temporary = await useTmp("public-types");
	try {
		await copyFile(declarations, path.join(temporary, "miniflare.d.ts"));
		await copyFile(
			path.join(packageRoot, "test/fixtures/public-types/consumer.ts.txt"),
			path.join(temporary, "consumer.ts")
		);
		const options: ts.CompilerOptions = {
			strict: true,
			exactOptionalPropertyTypes: true,
			noUncheckedIndexedAccess: true,
			skipLibCheck: false,
			noEmit: true,
			module: ts.ModuleKind.NodeNext,
			moduleResolution: ts.ModuleResolutionKind.NodeNext,
			target: ts.ScriptTarget.ES2024,
			lib: ["lib.es2024.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
			types: ["node"],
		};
		const consumer = path.join(temporary, "consumer.ts");
		const program = ts.createProgram([consumer], options);
		expect(
			ts
				.getPreEmitDiagnostics(program)
				.map((diagnostic) =>
					ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
				)
		).toEqual([]);

		const invalid = path.join(temporary, "invalid.ts");
		await writeFile(
			invalid,
			'import type { VpcNetworkBinding } from "./miniflare";\nconst invalid: VpcNetworkBinding = { type: "vpc-network" };\n'
		);
		const invalidProgram = ts.createProgram([invalid], options);
		expect(
			ts.getPreEmitDiagnostics(invalidProgram).map(({ code }) => code)
		).toEqual([2322]);

		const built: typeof import("../src") = createRequire(import.meta.url)(
			path.join(packageRoot, "dist/src/index.js")
		);
		expect(built.AssetConfigSchema.parse({})).toEqual({});
		expect(built.RouterConfigSchema.parse({})).toEqual({});
		expect(built.UnsafeBindingSchema.parse({ type: "unsafe:example" })).toEqual(
			{ type: "unsafe:example" }
		);
	} finally {
		await removeDir(temporary);
	}
}, 30_000);
