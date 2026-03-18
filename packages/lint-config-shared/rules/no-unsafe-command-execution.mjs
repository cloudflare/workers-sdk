const UNSAFE_FUNCTIONS = [
	"exec",
	"execSync",
	"spawn",
	"spawnSync",
	"execFile",
	"execFileSync",
];

/**
 * Package names for child_process module
 */
const CHILD_PROCESS_MODULES = ["child_process", "node:child_process"];

/**
 * Check if a node is a template literal with expressions
 */
function isTemplateLiteralWithExpressions(node) {
	return node.type === "TemplateLiteral" && node.expressions.length > 0;
}

/**
 * Check if a node is a binary expression (string concatenation)
 */
function isBinaryExpression(node) {
	return node.type === "BinaryExpression" && node.operator === "+";
}

/**
 * Check if a call is to one of the unsafe functions from child_process
 * Supports both CommonJS (require) and ES module (import) syntax
 */
function isUnsafeChildProcessCall(node, context) {
	const sourceCode = context.sourceCode || context.getSourceCode();
	const scope = sourceCode.getScope
		? sourceCode.getScope(node)
		: context.getScope();

	// Check for direct require('child_process').exec(...) pattern
	if (
		node.callee.type === "MemberExpression" &&
		node.callee.object.type === "CallExpression" &&
		node.callee.object.callee.name === "require" &&
		node.callee.object.arguments[0]?.type === "Literal" &&
		CHILD_PROCESS_MODULES.includes(node.callee.object.arguments[0].value) &&
		node.callee.property.type === "Identifier" &&
		UNSAFE_FUNCTIONS.includes(node.callee.property.name)
	) {
		return node.callee.property.name;
	}

	// Check for imported functions: const { exec } = require('child_process') or import { exec } from 'child_process'
	if (node.callee.type === "Identifier") {
		// Walk up the scope chain to find if this identifier is from child_process
		let currentScope = scope;
		while (currentScope) {
			const variable = currentScope.set.get(node.callee.name);
			if (variable && variable.defs.length > 0) {
				const def = variable.defs[0];

				// Check for ES module import: import { execSync } from 'node:child_process'
				// or import { execSync as run } from 'node:child_process'
				if (
					def.type === "ImportBinding" &&
					def.parent?.type === "ImportDeclaration"
				) {
					const importSource = def.parent.source?.value;
					if (CHILD_PROCESS_MODULES.includes(importSource)) {
						// Check if it's one of the unsafe functions
						// For aliased imports: import { execSync as run } - def.node.imported.name = "execSync"
						// For regular imports: import { execSync } - def.node.local.name = "execSync"
						const importedName =
							def.node.imported?.name || def.node.local?.name;
						if (importedName && UNSAFE_FUNCTIONS.includes(importedName)) {
							return importedName;
						}
					}
				}

				// Check for CommonJS require()
				if (
					def.type === "Variable" &&
					def.parent?.type === "VariableDeclaration" &&
					def.node?.init
				) {
					const init = def.node.init;
					// Check if it's from require('child_process')
					if (
						init.type === "CallExpression" &&
						init.callee.name === "require" &&
						init.arguments[0]?.type === "Literal" &&
						CHILD_PROCESS_MODULES.includes(init.arguments[0].value)
					) {
						// For destructured requires, check the property name
						// const { execSync: run } = require('child_process')
						if (def.node.id?.type === "ObjectPattern") {
							const prop = def.node.id.properties.find(
								(p) => p.value?.name === node.callee.name
							);
							if (prop && UNSAFE_FUNCTIONS.includes(prop.key?.name)) {
								return prop.key.name;
							}
						}
						// For direct import: const execSync = require('child_process').execSync
						if (UNSAFE_FUNCTIONS.includes(node.callee.name)) {
							return node.callee.name;
						}
					}
					// Check if it's from destructuring: const { exec } = require('child_process')
					if (
						init.type === "MemberExpression" &&
						init.object.type === "CallExpression" &&
						init.object.callee.name === "require" &&
						init.object.arguments[0]?.type === "Literal" &&
						CHILD_PROCESS_MODULES.includes(init.object.arguments[0].value)
					) {
						if (UNSAFE_FUNCTIONS.includes(node.callee.name)) {
							return node.callee.name;
						}
					}
				}
			}
			currentScope = currentScope.upper;
		}
	}

	// Check for MemberExpression: childProcess.exec(...)
	if (
		node.callee.type === "MemberExpression" &&
		node.callee.property.type === "Identifier" &&
		UNSAFE_FUNCTIONS.includes(node.callee.property.name)
	) {
		// This is a heuristic - we check if the object might be child_process
		// We return the function name to trigger checking, even if we're not 100% sure
		return node.callee.property.name;
	}

	return null;
}

/**
 * Check if the options object has shell: true
 */
function hasShellOption(node) {
	if (!node || node.type !== "ObjectExpression") {
		return false;
	}

	return node.properties.some(
		(prop) =>
			prop.type === "Property" &&
			prop.key.type === "Identifier" &&
			prop.key.name === "shell" &&
			prop.value.type === "Literal" &&
			prop.value.value === true
	);
}

/**
 * Get a helpful suggestion message based on the function being used
 */
function getSuggestion(functionName, hasTemplate, hasConcatenation) {
	const patterns = [];
	if (hasTemplate) {
		patterns.push("template literal with expressions");
	}
	if (hasConcatenation) {
		patterns.push("string concatenation");
	}

	const patternStr = patterns.join(" and ");

	if (functionName.includes("exec")) {
		return `Detected ${patternStr} in ${functionName}(). Use execFileSync() with an argument array instead to prevent command injection: execFileSync("command", ["arg1", "arg2"])`;
	}

	if (functionName.includes("spawn")) {
		return `Detected ${patternStr} in ${functionName}(). Ensure you're using an argument array and avoid shell: true with user input.`;
	}

	return `Detected ${patternStr} in ${functionName}(). This may allow command injection. Use argument arrays instead of string interpolation.`;
}

export default {
	meta: {
		type: "error",
		docs: {
			description:
				"Disallow template literals and string concatenation in shell command execution",
			category: "Possible Security Vulnerability",
			recommended: true,
			url: "https://cwe.mitre.org/data/definitions/78.html",
		},
		messages: {
			unsafeCommandExecution:
				"Potential command injection vulnerability: {{message}}",
		},
		schema: [], // no options
	},

	create(context) {
		return {
			CallExpression(node) {
				// Check if this is a call to a child_process function
				const functionName = isUnsafeChildProcessCall(node, context);
				if (!functionName) {
					return;
				}

				// Check first argument (command string)
				if (node.arguments.length === 0) {
					return;
				}

				const commandArg = node.arguments[0];
				let hasTemplate = false;
				let hasConcatenation = false;

				// Check for template literal with expressions
				if (isTemplateLiteralWithExpressions(commandArg)) {
					hasTemplate = true;
				}

				// Check for string concatenation
				if (isBinaryExpression(commandArg)) {
					hasConcatenation = true;
				}

				// For spawn/spawnSync, also check if shell: true is in options
				if (
					(functionName === "spawn" || functionName === "spawnSync") &&
					node.arguments.length >= 3
				) {
					const options = node.arguments[2];
					if (hasShellOption(options) && (hasTemplate || hasConcatenation)) {
						context.report({
							node,
							messageId: "unsafeCommandExecution",
							data: {
								message: getSuggestion(
									functionName,
									hasTemplate,
									hasConcatenation
								),
							},
						});
						return;
					}
				}

				// Report if we found unsafe patterns
				if (hasTemplate || hasConcatenation) {
					context.report({
						node,
						messageId: "unsafeCommandExecution",
						data: {
							message: getSuggestion(
								functionName,
								hasTemplate,
								hasConcatenation
							),
						},
					});
				}
			},
		};
	},
};
