import * as fs from "fs";
import * as path from "path";
import ts from "typescript";
import { cloudflare, env, nodeless } from "unenv";

export function generateNodeCompatV2Types(nodeTypesPath: string): string {
	// Get the list of polyfilled modules from unenv
	const _env = env(nodeless, cloudflare);
	const polyfillModules = new Set(
		Object.keys(_env.alias)
			.filter((id) => id.startsWith("node:"))
			.map((id) => id.replace("node:", ""))
	);

	// Create a TypeScript program from the @types/node declaration files
	const program = ts.createProgram(
		fs
			.readdirSync(nodeTypesPath)
			.filter((file) => file.endsWith(".d.ts"))
			.map((file) => path.join(nodeTypesPath, file)),
		{}
	);

	let output = "";

	// Process each source file
	for (const sourceFile of program.getSourceFiles()) {
		if (!sourceFile.isDeclarationFile) {
			continue;
		}

		ts.forEachChild(sourceFile, (node) => {
			if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) {
				const moduleName = node.name.text.replace(/^node:/, "");

				if (polyfillModules.has(moduleName)) {
					// Get the full text of the node, including comments
					const fullText = node.getFullText(sourceFile);

					output += `${fullText}\n\n`;
				}
			}
		});
	}

	return output;
}
