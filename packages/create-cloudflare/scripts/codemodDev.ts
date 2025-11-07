import { parseFile, parseTs } from "helpers/codemod";
import { writeFile } from "helpers/files";
import { join } from "path";
import * as recast from "recast";

/**
 * Writing code-mods often requires some trial and error. Since they are often
 * applied later on in a c3 run, manual testing can become a hassle. This script was meant
 * to help test and develop transforms in isolation without having to write a throw-away script.
 *
 * Replace your codemod below and run the script with `pnpm run dev:codemod`.
 *
 * Test files can be kept in the `./snippets` directory, where you will also find the output from
 * the last run.
 *
 */

/**
 * This function mocks the `transformFile` API but outputs it to the console and writes it
 * to a dedicated output file for easier testing.
 */
export const testTransform = (
	filePath: string,
	methods: recast.types.Visitor
) => {
	const ast = parseFile(join(__dirname, filePath));

	if (ast) {
		recast.visit(ast, methods);
		const code = recast.print(ast).code;
		console.log(code);
		writeFile(join(__dirname, "snippets", "output"), code);
	}
};

// Use this function to experiment with a codemod in isolation
const testCodemod = () => {
	// const b = recast.types.builders;
	// const snippets = loadSnippets(join(__dirname, "snippets"));

	testTransform("snippets/test.ts", {
		visitIdentifier(n) {
			n.node.name = "Potato";

			return false;
		},
	});
};
testCodemod();

// This function can be used to inspect the AST of a particular snippet
const printSnippet = () => {
	const snippet = `
    if(true) {
      console.log("potato");
    }
  `;

	const program = parseTs(snippet).program;
	console.log(program.body[0]);
};
// printSnippet();
