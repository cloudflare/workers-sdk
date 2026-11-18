import {
	cpSync,
	mkdirSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * Type-check a Worker project using a package's published declarations and
 * installed dependencies.
 *
 * @param consumerRoot - Absolute path to an empty temporary directory.
 * @param packageRoot - Absolute path to the workspace package.
 * @param buildDirectory - Directory containing the package's built output.
 * @param source - TypeScript source importing the package's public API.
 * @returns Diagnostics in the consumer, package, and workspace dependencies.
 */
export function checkPublishedTypes(
	consumerRoot: string,
	packageRoot: string,
	buildDirectory: string,
	source: string
): string[] {
	const manifest = JSON.parse(
		readFileSync(path.join(packageRoot, "package.json"), "utf8")
	) as {
		name: string;
		dependencies?: Record<string, string>;
		peerDependencies?: Record<string, string>;
	};
	const consumerPackage = path.join(
		consumerRoot,
		"node_modules",
		manifest.name
	);
	const diagnosticDirectories = [consumerRoot, path.dirname(packageRoot)];
	mkdirSync(consumerPackage, { recursive: true });
	cpSync(
		path.join(packageRoot, buildDirectory),
		path.join(consumerPackage, buildDirectory),
		{ recursive: true }
	);
	cpSync(
		path.join(packageRoot, "package.json"),
		path.join(consumerPackage, "package.json")
	);
	for (const name of new Set([
		...Object.keys(manifest.dependencies ?? {}),
		...Object.keys(manifest.peerDependencies ?? {}),
		"@types/node",
		"@cloudflare/workers-types",
	])) {
		const destination = path.join(consumerRoot, "node_modules", name);
		mkdirSync(path.dirname(destination), { recursive: true });
		symlinkSync(
			path.join(packageRoot, "node_modules", name),
			destination,
			"junction"
		);
	}
	writeFileSync(
		path.join(consumerRoot, "package.json"),
		JSON.stringify({ type: "module" })
	);
	const consumer = path.join(consumerRoot, "consumer.ts");
	writeFileSync(consumer, source);
	const options: ts.CompilerOptions = {
		module: ts.ModuleKind.NodeNext,
		target: ts.ScriptTarget.ES2022,
		strict: true,
		skipLibCheck: false,
		noEmit: true,
		types: ["node", "@cloudflare/workers-types/experimental"],
	};
	const host = ts.createCompilerHost(options);
	host.getCurrentDirectory = () => consumerRoot;
	const program = ts.createProgram([consumer], options, host);
	return ts
		.getPreEmitDiagnostics(program)
		.filter(
			({ file }) =>
				!file ||
				diagnosticDirectories.some((directory) =>
					isInsideDirectory(directory, file.fileName)
				)
		)
		.map((diagnostic) => {
			const file = diagnostic.file
				? path.relative(packageRoot, diagnostic.file.fileName)
				: "consumer.ts";
			return `${file}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`;
		});
}

function isInsideDirectory(directory: string, filename: string): boolean {
	const relative = path.relative(directory, filename);
	return (
		relative !== ".." &&
		!relative.startsWith(`..${path.sep}`) &&
		!path.isAbsolute(relative)
	);
}
