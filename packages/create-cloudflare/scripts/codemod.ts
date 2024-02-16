import { join } from "path";
import { parseFile } from "helpers/codemod";
import { writeFile } from "helpers/files";
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
 * @param filePath
 * @param methods
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

const testCodemod = () => {
	// const b = recast.types.builders;

	testTransform("snippets/test.ts", {
		visitIdentifier(n) {
			n.node.name = "Potato";

			return false;
		},
	});
};

testCodemod();
