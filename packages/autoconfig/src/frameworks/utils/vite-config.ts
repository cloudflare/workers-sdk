import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseFile, transformFile } from "@cloudflare/shared-ast-primitives";
import { parsePackageJSON, UserError } from "@cloudflare/workers-utils";
import * as recast from "recast";
import dedent from "ts-dedent";
import type { AutoConfigContext, AutoConfigTarget } from "../../context";
import type { types } from "recast";

const b = recast.types.builders;
const t = recast.types.namedTypes;
const CLOUDFLARE_VITE_PLUGIN = "@cloudflare/vite-plugin";

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

/** Recognizes existing plugin setup without reconfiguring legacy Wrangler projects. */
export function checkIfViteConfigUsesCloudflarePlugin(
	projectPath: string,
	context?: AutoConfigContext
): boolean {
	const filePath = getViteConfigPath(projectPath);
	const ast = parseFile(filePath);
	if (!ast) {
		return false;
	}

	let importsCloudflarePlugin = false;
	let configuresCloudflarePlugin = false;

	recast.visit(ast, {
		visitProgram(n) {
			importsCloudflarePlugin = n.node.body.some(isCloudflarePluginImport);
			this.traverse(n);
		},
		visitCallExpression: function (n) {
			const callee = n.node.callee as types.namedTypes.Identifier;
			if (callee.name !== "defineConfig") {
				return this.traverse(n);
			}

			const configObject = extractConfigObject(n.node.arguments[0]);
			if (!configObject) {
				context?.logger.debug(
					`Vite config uses an unsupported expression type. Skipping Cloudflare plugin check.`
				);
				return this.traverse(n);
			}

			const pluginsProp = configObject.properties.findLast((prop) =>
				isPluginsProp(prop)
			);
			if (!pluginsProp || !t.ArrayExpression.check(pluginsProp.value)) {
				context?.logger.debug(
					`Vite config does not have a valid plugins array. Skipping Cloudflare plugin check.`
				);
				return this.traverse(n);
			}

			if (hasFollowingOverride(configObject, pluginsProp)) {
				context?.logger.debug(
					`Vite config has a later property that may override its plugins array. Skipping Cloudflare plugin check.`
				);
				return this.traverse(n);
			}

			if (
				pluginsProp.value.elements.some(
					(el) =>
						isDeferredCloudflarePlugin(el) ||
						(importsCloudflarePlugin && isCloudflarePluginCall(el))
				)
			) {
				configuresCloudflarePlugin = true;
			}

			this.traverse(n);
		},
	});

	return configuresCloudflarePlugin;
}

function isCloudflarePluginImport(node: types.ASTNode): boolean {
	return (
		t.ImportDeclaration.check(node) &&
		node.source.value === CLOUDFLARE_VITE_PLUGIN
	);
}

function isCloudflarePluginCall(node: types.ASTNode | null): boolean {
	return (
		t.CallExpression.check(node) &&
		t.Identifier.check(node.callee) &&
		node.callee.name === "cloudflare"
	);
}

/** Recognizes the dynamic plugin import added to Vite configs loaded as CommonJS. */
function isDeferredCloudflarePlugin(node: types.ASTNode | null): boolean {
	if (
		!t.CallExpression.check(node) ||
		!t.MemberExpression.check(node.callee) ||
		!t.Identifier.check(node.callee.property) ||
		node.callee.property.name !== "then"
	) {
		return false;
	}
	const imported = node.callee.object;
	const source = t.ImportExpression.check(imported)
		? imported.source
		: t.CallExpression.check(imported) && t.Import.check(imported.callee)
			? imported.arguments[0]
			: undefined;
	return (
		t.StringLiteral.check(source) && source.value === CLOUDFLARE_VITE_PLUGIN
	);
}

// Match Vite's DEFAULT_CONFIG_FILES order so inspection and execution use the same file.
const VITE_CONFIG_FILES = [
	"vite.config.js",
	"vite.config.mjs",
	"vite.config.ts",
	"vite.config.cjs",
	"vite.config.mts",
	"vite.config.cts",
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

/** Checks unsupported CommonJS files before setup installs or changes any files. */
export function assertViteConfigCanBeTransformed(projectPath: string): void {
	const filePath = getViteConfigPath(projectPath);
	if ([".cjs", ".cts"].includes(path.extname(filePath))) {
		// Vite bundles these extensions as CommonJS even when they use ESM syntax.
		// The Cloudflare plugin only exposes an ESM import entry point.
		throw new UserError(
			"Cannot automatically modify a CommonJS Vite configuration. Convert it to ESM (import/export) in vite.config.mjs or vite.config.mts before adding the Cloudflare plugin.",
			{ telemetryMessage: "autoconfig CommonJS vite config unsupported" }
		);
	}
}

/** Adds the Cloudflare plugin while preserving the project's Vite config path and module type. */
export function transformViteConfig(
	projectPath: string,
	options: {
		target?: AutoConfigTarget;
		viteEnvironmentName?: string;
		incompatibleVitePlugins?: string[];
	} = {}
) {
	const filePath = getViteConfigPath(projectPath);
	assertViteConfigCanBeTransformed(projectPath);
	const removedIncompatiblePlugins = new Set<string>();
	let deferPluginImport =
		options.target === "cf" &&
		[".js", ".ts"].includes(path.extname(filePath)) &&
		!isModulePackage(projectPath);

	transformFile(filePath, {
		visitProgram(n) {
			if (n.node.body.some(isCloudflarePluginImport)) {
				deferPluginImport = false;
			} else if (!deferPluginImport) {
				const lastImportIndex = n.node.body.findLastIndex(
					(statement) => statement.type === "ImportDeclaration"
				);
				// Static form: import { cloudflare } from "@cloudflare/vite-plugin";
				const importAst = b.importDeclaration(
					[b.importSpecifier(b.identifier("cloudflare"))],
					b.stringLiteral(CLOUDFLARE_VITE_PLUGIN)
				);
				if (lastImportIndex === -1) {
					n.get("body").unshift(importAst);
				} else {
					n.get("body", lastImportIndex).insertAfter(importAst);
				}
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
					(el) => isCloudflarePluginCall(el) || isDeferredCloudflarePlugin(el)
				)
			) {
				const plugin = b.identifier("plugin");
				const cloudflare = b.identifier("cloudflare");
				const pluginCall = b.callExpression(
					deferPluginImport
						? b.memberExpression(plugin, cloudflare)
						: cloudflare,
					[
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
					]
				);
				pluginsProp.value.elements.push(
					deferPluginImport
						? deferCloudflarePlugin(plugin, pluginCall)
						: pluginCall
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

function isModulePackage(projectPath: string): boolean {
	const manifestPath = path.join(projectPath, "package.json");
	if (!existsSync(manifestPath)) {
		return false;
	}
	const manifest = parsePackageJSON(
		readFileSync(manifestPath, "utf8"),
		manifestPath
	);
	return Boolean(
		manifest &&
		typeof manifest === "object" &&
		"type" in manifest &&
		manifest.type === "module"
	);
}

/** Uses a promise in the plugins array so CommonJS Vite configs can load the ESM-only plugin. */
function deferCloudflarePlugin(
	plugin: types.namedTypes.Identifier,
	pluginCall: types.namedTypes.CallExpression
) {
	return b.callExpression(
		b.memberExpression(
			b.importExpression(b.stringLiteral(CLOUDFLARE_VITE_PLUGIN)),
			b.identifier("then")
		),
		[b.arrowFunctionExpression([plugin], pluginCall)]
	);
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
