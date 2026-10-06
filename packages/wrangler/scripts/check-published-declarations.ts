import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
	getEntryPointPaths,
	getPackageNameFromSpecifier,
	isBareSpecifier,
	validateDistImports,
	type PackageJSON,
} from "../../../tools/deployments/validate-package-dependencies";

type PublishedPackageJSON = PackageJSON & { types?: string };

if (require.main === module) {
	checkPublishedDeclarations(path.resolve(__dirname, ".."));
	// Wrangler keeps workers-utils' binding types external to preserve their unique
	// symbol identity. Its installed declarations must also resolve without private
	// workspace packages or development dependencies.
	checkPublishedDeclarations(path.resolve(__dirname, "../../workers-utils"));
}

/** Validate the declaration files shipped at a package's public type entry points. */
export function checkPublishedDeclarations(packageRoot: string): void {
	const packageJson = JSON.parse(
		fs.readFileSync(path.join(packageRoot, "package.json"), "utf-8")
	) as PublishedPackageJSON;

	const typeEntryPoints = new Set(
		[
			packageJson.types,
			...getEntryPointPaths(packageJson).filter(isDeclarationPath),
		].filter((value): value is string => value !== undefined)
	);

	const declarationFiles = new Set<string>();
	for (const entryPoint of typeEntryPoints) {
		const absoluteEntryPoint = path.resolve(packageRoot, entryPoint);
		if (!fs.existsSync(absoluteEntryPoint)) {
			throw new Error("Missing built type entry point: " + entryPoint);
		}
		collectDeclarationFiles(path.dirname(absoluteEntryPoint), declarationFiles);
	}

	const importedPackages = new Set<string>();
	const errors: string[] = [];
	for (const declarationFile of declarationFiles) {
		const preprocessed = ts.preProcessFile(
			fs.readFileSync(declarationFile, "utf-8"),
			true,
			true
		);
		const references = [
			...preprocessed.importedFiles,
			...preprocessed.typeReferenceDirectives,
			...preprocessed.referencedFiles,
		];
		for (const { fileName } of references) {
			if (isBareSpecifier(fileName)) {
				importedPackages.add(getPackageNameFromSpecifier(fileName));
			} else if (fileName.startsWith(".")) {
				const { resolvedModule } = ts.resolveModuleName(
					fileName,
					declarationFile,
					{ moduleResolution: ts.ModuleResolutionKind.Bundler },
					ts.sys
				);
				if (
					resolvedModule === undefined ||
					!declarationFiles.has(path.resolve(resolvedModule.resolvedFileName))
				) {
					errors.push(
						path.relative(packageRoot, declarationFile) +
							" references an unpublished declaration: " +
							fileName
					);
				}
			}
		}
	}

	errors.push(
		...validateDistImports(packageJson.name, packageJson, importedPackages)
	);
	if (errors.length > 0) {
		throw new Error(
			packageJson.name +
				"'s published declarations have unresolved package boundaries:\n" +
				errors.map((error) => "- " + error).join("\n")
		);
	}

	process.stdout.write(
		"Checked " +
			declarationFiles.size +
			" published declaration file(s) across " +
			typeEntryPoints.size +
			" public type entry point(s) for " +
			packageJson.name +
			".\n"
	);
}

function isDeclarationPath(filePath: string): boolean {
	return /\.d\.(?:ts|mts|cts)$/.test(filePath);
}

function collectDeclarationFiles(directory: string, files: Set<string>): void {
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const absolutePath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			collectDeclarationFiles(absolutePath, files);
		} else if (isDeclarationPath(entry.name)) {
			files.add(absolutePath);
		}
	}
}
