/**
 * Module sources for Node.js filesystem APIs
 */
const FS_MODULES = ["fs", "node:fs"];
const FS_PROMISES_MODULES = ["fs/promises", "node:fs/promises"];

/**
 * Check if an options argument contains `recursive: true`
 */
function hasRecursiveOption(node) {
	if (!node || node.type !== "ObjectExpression") {
		return false;
	}

	return node.properties.some(
		(prop) =>
			prop.type === "Property" &&
			prop.key.type === "Identifier" &&
			prop.key.name === "recursive" &&
			prop.value.type === "Literal" &&
			prop.value.value === true
	);
}

/**
 * Resolve the import source for a given identifier by walking the scope chain.
 * Returns the module specifier string (e.g. "node:fs") or null if not from an fs module.
 */
function resolveImportSource(name, scope) {
	let currentScope = scope;
	while (currentScope) {
		const variable = currentScope.set.get(name);
		if (variable && variable.defs.length > 0) {
			const def = variable.defs[0];

			// ES module import: import fs from "node:fs" / import { rmSync } from "node:fs"
			if (
				def.type === "ImportBinding" &&
				def.parent?.type === "ImportDeclaration"
			) {
				return def.parent.source?.value ?? null;
			}

			// CommonJS require: const fs = require("node:fs")
			if (
				def.type === "Variable" &&
				def.node?.init?.type === "CallExpression" &&
				def.node.init.callee.name === "require" &&
				def.node.init.arguments[0]?.type === "Literal"
			) {
				return def.node.init.arguments[0].value;
			}
		}
		currentScope = currentScope.upper;
	}
	return null;
}

/**
 * Get the scope for a node using the available API.
 */
function getScope(node, context) {
	const sourceCode = context.sourceCode || context.getSourceCode();
	return sourceCode.getScope ? sourceCode.getScope(node) : context.getScope();
}

/**
 * Check if a CallExpression is a recursive rm/rmSync call from an fs module.
 *
 * Supported patterns:
 *   - fs.rm(path, { recursive: true })            (fs from "node:fs/promises")
 *   - fs.rmSync(path, { recursive: true })        (fs from "node:fs")
 *   - fs.promises.rm(path, { recursive: true })   (fs from "node:fs")
 *   - rm(path, { recursive: true })               (named import from "node:fs/promises")
 *   - rmSync(path, { recursive: true })           (named import from "node:fs")
 */
function checkCall(node, context) {
	const scope = getScope(node, context);
	const callee = node.callee;

	// Pattern 1: Direct named import call — rm(...) or rmSync(...)
	if (callee.type === "Identifier") {
		const name = callee.name;
		if (name !== "rm" && name !== "rmSync") {
			return null;
		}

		const source = resolveImportSource(name, scope);
		if (!source) {
			return null;
		}

		// rmSync must come from "node:fs" / "fs"
		if (name === "rmSync" && FS_MODULES.includes(source)) {
			const options = node.arguments[1];
			if (hasRecursiveOption(options)) {
				return name;
			}
		}

		// rm can come from "node:fs/promises" / "fs/promises"
		if (name === "rm" && FS_PROMISES_MODULES.includes(source)) {
			const options = node.arguments[1];
			if (hasRecursiveOption(options)) {
				return name;
			}
		}

		// rm can also come from "node:fs" / "fs" (callback-based)
		if (name === "rm" && FS_MODULES.includes(source)) {
			const options = node.arguments[1];
			if (hasRecursiveOption(options)) {
				return name;
			}
			// callback-based fs.rm: options may be in arg[2] if arg[1] is the callback
			const options2 = node.arguments[2];
			if (hasRecursiveOption(options2)) {
				return name;
			}
		}

		return null;
	}

	// Pattern 2: Member expression — obj.rm(...) or obj.rmSync(...) or obj.promises.rm(...)
	if (callee.type === "MemberExpression") {
		const prop = callee.property;
		if (prop.type !== "Identifier") {
			return null;
		}

		// Sub-pattern 2a: fs.rmSync(...) or fs.rm(...)
		if (
			(prop.name === "rm" || prop.name === "rmSync") &&
			callee.object.type === "Identifier"
		) {
			const source = resolveImportSource(callee.object.name, scope);
			if (!source) {
				return null;
			}

			// fs.rmSync from "node:fs"
			if (prop.name === "rmSync" && FS_MODULES.includes(source)) {
				const options = node.arguments[1];
				if (hasRecursiveOption(options)) {
					return prop.name;
				}
			}

			// fs.rm from "node:fs/promises"
			if (prop.name === "rm" && FS_PROMISES_MODULES.includes(source)) {
				const options = node.arguments[1];
				if (hasRecursiveOption(options)) {
					return prop.name;
				}
			}

			// fs.rm from "node:fs" — this is fs.rm (callback-based)
			if (prop.name === "rm" && FS_MODULES.includes(source)) {
				const options = node.arguments[1];
				// callback-based fs.rm: the options may be arg[1] or arg[2] if there's a callback
				if (hasRecursiveOption(options)) {
					return prop.name;
				}
				const options2 = node.arguments[2];
				if (hasRecursiveOption(options2)) {
					return prop.name;
				}
			}

			return null;
		}

		// Sub-pattern 2b: fs.promises.rm(...)
		if (
			prop.name === "rm" &&
			callee.object.type === "MemberExpression" &&
			callee.object.property.type === "Identifier" &&
			callee.object.property.name === "promises" &&
			callee.object.object.type === "Identifier"
		) {
			const source = resolveImportSource(callee.object.object.name, scope);
			if (source && FS_MODULES.includes(source)) {
				const options = node.arguments[1];
				if (hasRecursiveOption(options)) {
					return "promises.rm";
				}
			}
			return null;
		}
	}

	return null;
}

export default {
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Disallow direct fs.rm/fs.rmSync with recursive option; use removeDir/removeDirSync from @cloudflare/workers-utils instead",
			category: "Best Practices",
			recommended: true,
		},
		messages: {
			noDirectRecursiveRm:
				'Use {{ replacement }} from "@cloudflare/workers-utils" instead of {{ method }} with { recursive: true }. ' +
				"The helper provides sensible defaults for retries on Windows.",
		},
		schema: [], // no options
	},

	create(context) {
		return {
			CallExpression(node) {
				const method = checkCall(node, context);
				if (!method) {
					return;
				}

				const isSync = method === "rmSync";
				const replacement = isSync ? "removeDirSync" : "removeDir";

				context.report({
					node,
					messageId: "noDirectRecursiveRm",
					data: {
						method,
						replacement,
					},
				});
			},
		};
	},
};
