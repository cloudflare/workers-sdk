/**
 * ESLint rule to disallow importing `expect` from vitest.
 *
 * When running tests concurrently, the global `expect` cannot reliably detect
 * which test is running. Instead, `expect` should be destructured from the
 * test context: test("name", ({ expect }) => { ... })
 *
 * @see https://vitest.dev/guide/features.html#running-tests-concurrently
 */

export default {
	meta: {
		type: "problem",
		docs: {
			description: "Disallow importing `expect` from vitest",
			category: "Best Practices",
			recommended: false,
			url: "https://vitest.dev/guide/features.html#running-tests-concurrently",
		},
		messages: {
			noVitestImportExpect:
				"Import 'expect' from the test context instead of 'vitest' for concurrency safety. Use: test('name', ({ expect }) => { ... })",
		},
		schema: [],
	},

	create(context) {
		return {
			ImportDeclaration(node) {
				// Only check imports from "vitest"
				if (node.source.value !== "vitest") {
					return;
				}

				// Check each import specifier
				for (const specifier of node.specifiers) {
					// Only check named imports (import { expect } from "vitest")
					if (specifier.type !== "ImportSpecifier") {
						continue;
					}

					// Check if the imported name is "expect"
					const importedName =
						specifier.imported.type === "Identifier"
							? specifier.imported.name
							: specifier.imported.value;

					if (importedName === "expect") {
						context.report({
							node: specifier,
							messageId: "noVitestImportExpect",
						});
					}
				}
			},
		};
	},
};
