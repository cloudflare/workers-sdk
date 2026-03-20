/**
 * @type {import("eslint").Rule.RuleModule}
 *
 * Bans named (non-type) imports from "wrangler". Namespace imports
 * (`import * as wrangler from "wrangler"`) and type-only imports
 * (`import type { X } from "wrangler"`) are allowed.
 */
export default {
	meta: {
		type: "problem",
		docs: {
			description:
				'Disallow named imports from "wrangler". Use namespace imports instead.',
		},
		messages: {
			namedImport:
				'Use namespace import: `import * as wrangler from "wrangler"` instead of named imports.',
		},
		schema: [],
	},
	create(context) {
		return {
			ImportDeclaration(node) {
				if (node.source.value !== "wrangler") {
					return;
				}

				// Allow type-only imports: import type { X } from "wrangler"
				if (node.importKind === "type") {
					return;
				}

				// Check for named import specifiers (not namespace or default)
				const namedSpecifiers = node.specifiers.filter(
					(s) => s.type === "ImportSpecifier" && s.importKind !== "type"
				);

				if (namedSpecifiers.length > 0) {
					context.report({
						node,
						messageId: "namedImport",
					});
				}
			},
		};
	},
};
