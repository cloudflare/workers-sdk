import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import * as recast from "recast";
import { parseFile, parseTs } from "./index";

/**
 * Writing code-mods often requires some trial and error.
 * Often manual testing can become a hassle. This script was meant
 * to help test and develop transforms in isolation without having to write a throw-away script.
 *
 * Replace your codemod below and run the script with `pnpm run dev`
 */

/**
 * This function mocks the `transformFile` API but outputs it to the console and writes it
 * to a dedicated output file for easier testing.
 */
export const testTransform = (
	filePath: string,
	methods: recast.types.Visitor
) => {
	const devSnippetsDir = resolve(__dirname, "../dev-snippets");
	const resolvedInput = resolve(__dirname, filePath);
	const relativeInput = relative(devSnippetsDir, resolvedInput);

	if (
		relativeInput.startsWith("..") ||
		resolve(relativeInput) === relativeInput
	) {
		throw new Error(`Input file must be under dev-snippets/. Got: ${filePath}`);
	}

	const ast = parseFile(resolvedInput);

	if (ast) {
		recast.visit(ast, methods);
		const code = recast.print(ast).code;
		console.log(code);
		const outputPath = join(
			__dirname,
			"../dev-snippets-outputs",
			relativeInput
		);
		mkdirSync(dirname(outputPath), {
			recursive: true,
		});
		writeFileSync(outputPath, code);
	}
};

// Use this function to experiment with a codemod in isolation
const testCodemod = () => {
	testTransform("../dev-snippets/test.ts", {
		visitIdentifier(n) {
			n.node.name = "Potato";

			return false;
		},
	});
};

testCodemod();

// This function can be used to inspect the AST of a particular snippet
const _printSnippet = () => {
	const snippet = `
    if(true) {
      console.log("potato");
    }
  `;

	const program = parseTs(snippet).program;
	console.log(program.body[0]);
};
// _printSnippet();
