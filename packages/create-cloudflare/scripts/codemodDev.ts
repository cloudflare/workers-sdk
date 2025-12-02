import assert from "assert";
import { join } from "path";
import { parseFile, parseTs } from "helpers/codemod";
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
 */
export const testTransform = (
	filePath: string,
	methods: recast.types.Visitor,
) => {
	const ast = parseFile(join(__dirname, filePath));

	if (ast) {
		recast.visit(ast, methods);
		const code = recast.print(ast).code;
		console.log(code);
		writeFile(join(__dirname, "snippets", "output"), code);
	}
};
const b = recast.types.builders;

// Use this function to experiment with a codemod in isolation
const testCodemod = () => {
	// const b = recast.types.builders;
	// const snippets = loadSnippets(join(__dirname, "snippets"));

	testTransform("snippets/test.ts", {
		/**
		 * Visit an export default declaration of the form:
		 *
		 *   export default {
		 *     ...
		 *   }
		 *
		 * and add or modify the `future` property to look like:
		 *
		 *   future: {
		 *     unstable_viteEnvironmentApi: true
		 *   }
		 *
		 * For some extra complexity, this also supports TS `as` and `satisfies` expressions
		 */
		visitExportDefaultDeclaration(n) {
			let node: recast.types.namedTypes.ObjectExpression;
			if (
				(n.node.declaration.type === "TSAsExpression" ||
					n.node.declaration.type === "TSSatisfiesExpression") &&
				n.node.declaration.expression.type === "ObjectExpression"
			) {
				node = n.node.declaration.expression;
			} else if (n.node.declaration.type === "ObjectExpression") {
				node = n.node.declaration;
			} else {
				throw new Error(
					"Could not parse React Router config file. Please add the following snippet manually:\n  future: {\n    unstable_viteEnvironmentApi: true,\n  }",
				);
			}

			assert(node.type === "ObjectExpression");

			// Is therer an existing `future` key? If there is, we should modufy it rather than creating a new one
			const futureKey = node.properties.findIndex(
				(p) =>
					p.type === "ObjectProperty" &&
					p.key.type === "Identifier" &&
					p.key.name === "future" &&
					p.value.type === "ObjectExpression",
			);
			if (futureKey !== -1) {
				const future = node.properties[futureKey];
				assert(
					future.type === "ObjectProperty" &&
						future.value.type === "ObjectExpression",
				);

				// Does the `future` key already have a property called `unstable_viteEnvironmentApi`?
				const viteEnvironment = future.value.properties.findIndex(
					(p) =>
						p.type === "ObjectProperty" &&
						p.key.type === "Identifier" &&
						p.key.name === "unstable_viteEnvironmentApi" &&
						p.value.type === "BooleanLiteral",
				);

				// If there's already a unstable_viteEnvironmentApi key, set the value to true
				if (viteEnvironment !== -1) {
					const prop = future.value.properties[viteEnvironment];
					assert(
						prop.type === "ObjectProperty" &&
							prop.value.type === "BooleanLiteral",
					);
					prop.value.value = true;
				} else {
					const prop = b.objectProperty(
						b.identifier("unstable_viteEnvironmentApi"),
						b.booleanLiteral(true),
					);
					future.value.properties.push(prop);
				}
			} else {
				node.properties.push(
					b.objectProperty(
						b.identifier("future"),
						b.objectExpression([
							b.objectProperty(
								b.identifier("unstable_viteEnvironmentApi"),
								b.booleanLiteral(true),
							),
						]),
					),
				);
			}

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
