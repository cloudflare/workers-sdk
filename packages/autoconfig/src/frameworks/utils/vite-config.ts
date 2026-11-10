import { existsSync } from "node:fs";
import path from "node:path";
import { parseFile, transformFile } from "@cloudflare/shared-ast-primitives";
import { UserError } from "@cloudflare/workers-utils";
import * as recast from "recast";
import dedent from "ts-dedent";
import type { AutoConfigContext } from "../../context";
import type { types } from "recast";

const b = recast.types.builders;
const t = recast.types.namedTypes;

/**
 * Extracts the ObjectExpression from the first argument of defineConfig().
 *
 * Handles:
 *   - defineConfig({ ... })
 *   - defineConfig(() => ({ ... }))
 *   - defineConfig(({ isSsrBuild }) => ({ ... }))
 *   - defineConfig(() => { return { ... }; })
 *   - defineConfig(function() { return { ... }; })
 *
 * @param node The first argument of defineConfig()
 * @returns The config object, or null if it can't be found
 */
export function extractConfigObject(
	node: recast.types.ASTNode
): types.namedTypes.ObjectExpression | null {
	// Direct object: defineConfig({ ... })
	if (t.ObjectExpression.check(node)) {
		return node;
	}

	// Arrow function: defineConfig(() => ({ ... })) or defineConfig(() => { return { ... }; })
	if (t.ArrowFunctionExpression.check(node)) {
		if (t.ObjectExpression.check(node.body)) {
			return node.body;
		}
		if (t.BlockStatement.check(node.body)) {
			return extractFromBlockStatement(node.body);
		}
	}

	// Function expression: defineConfig(function() { return { ... }; })
	if (t.FunctionExpression.check(node)) {
		return extractFromBlockStatement(node.body);
	}

	return null;
}

function extractFromBlockStatement(
	block: types.namedTypes.BlockStatement
): types.namedTypes.ObjectExpression | null {
	const returnStmt = block.body.find((s) => t.ReturnStatement.check(s));
	if (
		returnStmt &&
		t.ReturnStatement.check(returnStmt) &&
		returnStmt.argument &&
		t.ObjectExpression.check(returnStmt.argument)
	) {
		return returnStmt.argument;
	}
	return null;
}

/** Checks the effective plugins array without executing the project's configuration. */
export function checkIfViteConfigUsesCloudflarePlugin(
	projectPath: string,
	context?: AutoConfigContext
): boolean {
	const ast = parseFile(getViteConfigPath(projectPath));
	if (!ast) {
		return false;
	}

	const pluginBindings = new Set<string>();
	const namespaceBindings = new Set<string>();
	const configBindings = new Map<string, recast.types.ASTNode>();
	let usesCloudflarePlugin = false;
	function checkConfigObject(
		configObject: types.namedTypes.ObjectExpression | null
	): boolean {
		if (!configObject) {
			return false;
		}
		const pluginsProp = configObject.properties.findLast(isPluginsProp);
		if (
			!pluginsProp ||
			!t.ArrayExpression.check(pluginsProp.value) ||
			hasFollowingOverride(configObject, pluginsProp)
		) {
			context?.logger.debug("Vite config does not have a valid plugins array");
			return false;
		}
		return pluginsProp.value.elements.some((element) => {
			if (!t.CallExpression.check(element)) {
				return false;
			}
			const callee = element.callee;
			return (
				(t.Identifier.check(callee) && pluginBindings.has(callee.name)) ||
				(t.MemberExpression.check(callee) &&
					!callee.computed &&
					t.Identifier.check(callee.object) &&
					namespaceBindings.has(callee.object.name) &&
					t.Identifier.check(callee.property) &&
					callee.property.name === "cloudflare")
			);
		});
	}

	// Follow the exported value rather than unrelated defineConfig() calls.
	function resolveConfigObject(
		node: recast.types.ASTNode | undefined,
		seen = new Set<string>()
	): types.namedTypes.ObjectExpression | null {
		if (!node) {
			return null;
		}
		if (
			t.TSAsExpression.check(node) ||
			t.TSSatisfiesExpression.check(node) ||
			t.TSTypeAssertion.check(node) ||
			t.ParenthesizedExpression.check(node)
		) {
			return resolveConfigObject(node.expression, seen);
		}
		if (t.Identifier.check(node)) {
			if (seen.has(node.name)) {
				return null;
			}
			seen.add(node.name);
			return resolveConfigObject(configBindings.get(node.name), seen);
		}
		if (
			t.CallExpression.check(node) &&
			t.Identifier.check(node.callee) &&
			node.callee.name === "defineConfig"
		) {
			return resolveConfigObject(node.arguments[0], seen);
		}
		return extractConfigObject(node);
	}

	recast.visit(ast, {
		visitProgram(n) {
			for (const statement of n.node.body) {
				const declaration = t.ExportNamedDeclaration.check(statement)
					? statement.declaration
					: statement;
				if (t.VariableDeclaration.check(declaration)) {
					for (const binding of declaration.declarations) {
						if (
							t.VariableDeclarator.check(binding) &&
							t.Identifier.check(binding.id) &&
							binding.init
						) {
							configBindings.set(binding.id.name, binding.init);
						}
					}
				}
				if (
					statement.type !== "ImportDeclaration" ||
					statement.source.value !== "@cloudflare/vite-plugin"
				) {
					continue;
				}
				for (const specifier of statement.specifiers ?? []) {
					if (
						specifier.type === "ImportSpecifier" &&
						specifier.imported.type === "Identifier" &&
						specifier.imported.name === "cloudflare" &&
						specifier.local &&
						typeof specifier.local.name === "string"
					) {
						pluginBindings.add(specifier.local.name);
					} else if (
						specifier.type === "ImportNamespaceSpecifier" &&
						specifier.local &&
						typeof specifier.local.name === "string"
					) {
						namespaceBindings.add(specifier.local.name);
					}
				}
			}
			return this.traverse(n);
		},
		visitExportDefaultDeclaration(n) {
			usesCloudflarePlugin = checkConfigObject(
				resolveConfigObject(n.node.declaration)
			);
			return false;
		},
	});

	return usesCloudflarePlugin;
}

const VITE_CONFIG_FILES = [
	"vite.config.ts",
	"vite.config.js",
	"vite.config.mts",
	"vite.config.mjs",
	"vite.config.cts",
	"vite.config.cjs",
];

/** Returns whether the project has a Vite configuration file. */
export function hasViteConfig(projectPath: string): boolean {
	return VITE_CONFIG_FILES.some((name) =>
		existsSync(path.join(projectPath, name))
	);
}

/**
 * Finds the project's Vite config file.
 *
 * @param projectPath The path of the project
 * @returns The first existing file in Vite's default configuration-file order
 * @throws If the project has no Vite config file
 */
export function getViteConfigPath(projectPath: string): string {
	const file = VITE_CONFIG_FILES.map((name) =>
		path.join(projectPath, name)
	).find((filePath) => existsSync(filePath));
	if (!file) {
		throw new Error("Could not find Vite config file to modify");
	}
	return file;
}

/**
 * Name of vite plugins that we know are incompatible with the Cloudflare one
 */
const knownIncompatiblePlugins = ["nitro", "nitroV2Plugin", "netlify"];

function hasIdentifierOutsideImport(
	program: types.namedTypes.Program,
	identifierName: string
): boolean {
	let hasIdentifier = false;

	recast.types.visit(program, {
		visitIdentifier(n) {
			const parent = n.parentPath.node;
			if (
				n.node.name === identifierName &&
				!t.ImportSpecifier.check(parent) &&
				!t.ImportDefaultSpecifier.check(parent) &&
				!t.ImportNamespaceSpecifier.check(parent)
			) {
				hasIdentifier = true;
				return false;
			}

			this.traverse(n);
		},
	});

	return hasIdentifier;
}

export function transformViteConfig(
	projectPath: string,
	options: {
		viteEnvironmentName?: string;
		incompatibleVitePlugins?: string[];
	} = {}
) {
	const filePath = getViteConfigPath(projectPath);
	const removedIncompatiblePlugins = new Set<string>();

	transformFile(filePath, {
		visitProgram(n) {
			// Add an import of the @cloudflare/vite-plugin
			// ```
			// import {cloudflare} from "@cloudflare/vite-plugin";
			// ```
			const lastImportIndex = n.node.body.findLastIndex(
				(statement) => statement.type === "ImportDeclaration"
			);
			const lastImport = n.get("body", lastImportIndex);
			const importAst = b.importDeclaration(
				[b.importSpecifier(b.identifier("cloudflare"))],
				b.stringLiteral("@cloudflare/vite-plugin")
			);

			// Only import if not already imported
			if (
				!n.node.body.some(
					(s) =>
						s.type === "ImportDeclaration" &&
						s.source.value === "@cloudflare/vite-plugin"
				)
			) {
				lastImport.insertAfter(importAst);
			}

			this.traverse(n);

			// Remove imports that are now unused because their plugin was removed.
			n.node.body = n.node.body.filter((statement) => {
				if (
					!t.ImportDeclaration.check(statement) ||
					!statement.specifiers?.length
				) {
					return true;
				}

				statement.specifiers = statement.specifiers.filter(
					(specifier) =>
						!t.Identifier.check(specifier.local) ||
						!removedIncompatiblePlugins.has(specifier.local.name) ||
						hasIdentifierOutsideImport(n.node, specifier.local.name)
				);

				return statement.specifiers.length > 0;
			});

			return false;
		},
		visitCallExpression: function (n) {
			// Add the imported plugin to the config
			// ```
			// defineConfig({
			//   plugins: [cloudflare({ viteEnvironment: { name: 'ssr' } })],
			// });
			// ```
			// Also handles function-based configs like:
			// ```
			// defineConfig(({ isSsrBuild }) => ({
			//   plugins: [...]
			// }));
			// ```
			const callee = n.node.callee as types.namedTypes.Identifier;
			if (callee.name !== "defineConfig") {
				return this.traverse(n);
			}

			const configObject = extractConfigObject(n.node.arguments[0]);
			if (!configObject) {
				const argType = n.node.arguments[0]?.type ?? "unknown";
				throw new UserError(
					dedent`
					Cannot modify Vite config: could not extract a config object (found ${argType}).

					The Cloudflare plugin can only be automatically added to Vite configs that use:
					  - A simple object: defineConfig({ plugins: [...] })
					  - An arrow function returning an object: defineConfig(() => ({ plugins: [...] }))

					If your config uses a more complex pattern, please manually add the plugin:

					  import { cloudflare } from "@cloudflare/vite-plugin";

					  export default defineConfig({
					    plugins: [cloudflare()]
					  });
				`,
					{
						telemetryMessage: "autoconfig vite config object unsupported",
					}
				);
			}

			const pluginsProp = configObject.properties.findLast((prop) =>
				isPluginsProp(prop)
			);
			if (!pluginsProp || !t.ArrayExpression.check(pluginsProp.value)) {
				throw new UserError(
					dedent`
					Cannot modify Vite config: could not find a valid plugins array.

					Please ensure your Vite config has a plugins array:

					  export default defineConfig({
					    plugins: []
					  });
				`,
					{
						telemetryMessage: "autoconfig vite plugins array missing",
					}
				);
			}

			if (hasFollowingOverride(configObject, pluginsProp)) {
				throw new UserError(
					dedent`
					Cannot modify Vite config: a later property may override the plugins array.

					Define the effective plugins array after all spreads, computed properties, and plugins accessors, then retry autoconfiguration.
				`,
					{
						telemetryMessage: "autoconfig vite plugins array overridden",
					}
				);
			}

			// Only add the Cloudflare plugin if it's not already present
			if (
				!pluginsProp.value.elements.some(
					(el) =>
						el?.type === "CallExpression" &&
						el.callee.type === "Identifier" &&
						el.callee.name === "cloudflare"
				)
			) {
				pluginsProp.value.elements.push(
					b.callExpression(b.identifier("cloudflare"), [
						...(options.viteEnvironmentName
							? [
									b.objectExpression([
										b.objectProperty(
											b.identifier("viteEnvironment"),
											b.objectExpression([
												b.objectProperty(
													b.identifier("name"),
													b.stringLiteral(options.viteEnvironmentName)
												),
											])
										),
									]),
								]
							: []),
					])
				);
			}

			const incompatibleVitePlugins = [
				...knownIncompatiblePlugins,
				...(options.incompatibleVitePlugins ?? []),
			];

			// Remove incompatible plugins
			pluginsProp.value.elements = pluginsProp.value.elements.filter((el) => {
				if (
					el?.type === "CallExpression" &&
					el.callee.type === "Identifier" &&
					incompatibleVitePlugins.includes(el.callee.name)
				) {
					removedIncompatiblePlugins.add(el.callee.name);
					return false;
				}
				return true;
			});
			return false;
		},
	});
}

function isPluginsProp(
	prop: unknown
): prop is types.namedTypes.ObjectProperty | types.namedTypes.Property {
	return (
		(t.Property.check(prop) || t.ObjectProperty.check(prop)) &&
		getStaticPropertyName(prop) === "plugins"
	);
}

/**
 * Gets the name of an object property whose key is known without evaluating code.
 *
 * @param prop A member of an object expression
 * @returns The property name, or undefined for spreads and computed keys
 */
export function getStaticPropertyName(prop: unknown): string | undefined {
	if (
		!t.Property.check(prop) &&
		!t.ObjectProperty.check(prop) &&
		!t.ObjectMethod.check(prop)
	) {
		return undefined;
	}
	if (!prop.computed && t.Identifier.check(prop.key)) {
		return prop.key.name;
	}
	if (
		t.StringLiteral.check(prop.key) ||
		t.NumericLiteral.check(prop.key) ||
		t.BigIntLiteral.check(prop.key) ||
		t.Literal.check(prop.key)
	) {
		return String(prop.key.value);
	}
	return undefined;
}

function hasFollowingOverride(
	configObject: types.namedTypes.ObjectExpression,
	pluginsProp: types.namedTypes.ObjectProperty | types.namedTypes.Property
): boolean {
	return configObject.properties
		.slice(configObject.properties.indexOf(pluginsProp) + 1)
		.some((prop) => {
			const name = getStaticPropertyName(prop);
			return name === undefined || name === "plugins";
		});
}
