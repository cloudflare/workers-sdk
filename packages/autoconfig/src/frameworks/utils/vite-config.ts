import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseFile } from "@cloudflare/shared-ast-primitives";
import {
	parsePackageJSON,
	readFileSync,
	UserError,
} from "@cloudflare/workers-utils";
import { up } from "empathic/find";
import * as recast from "recast";
import dedent from "ts-dedent";
import type { AutoConfigContext, AutoConfigTarget } from "../../context";
import type { PackageJSON } from "@cloudflare/workers-utils";
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

	let pluginNames = new Set<string>();
	let configNames = new Set<string>();
	let configuresCloudflarePlugin = false;
	let hasLegacyPluginImport = false;
	let programScope: recast.types.NodePath["scope"];

	recast.visit(ast, {
		visitProgram(n) {
			programScope = n.scope;
			pluginNames = getImportedNames(
				n.node,
				["@cloudflare/vite-plugin"],
				"cloudflare"
			);
			hasLegacyPluginImport = n.node.body.some(
				(statement) =>
					t.ImportDeclaration.check(statement) &&
					statement.source.value === "@cloudflare/vite-plugin"
			);
			configNames = getImportedNames(
				n.node,
				VITE_CONFIG_HELPER_MODULES,
				"defineConfig"
			);
			configNames.add("defineConfig");
			this.traverse(n);
		},
		visitCallExpression: function (n) {
			const callee = n.node.callee as types.namedTypes.Identifier;
			if (!configNames.has(callee.name)) {
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

			const configScope = n.get("arguments", 0).scope;
			if (
				pluginsProp.value.elements.some(
					(el) =>
						isDeferredCloudflarePlugin(el) ||
						(el?.type === "CallExpression" &&
							el.callee.type === "Identifier" &&
							(pluginNames.has(el.callee.name)
								? lookupBinding(configScope, el.callee.name) === programScope
								: el.callee.name === "cloudflare" && hasLegacyPluginImport))
				)
			) {
				configuresCloudflarePlugin = true;
			}

			this.traverse(n);
		},
	});

	return configuresCloudflarePlugin;
}

function lookupBinding(scope: recast.types.NodePath["scope"], name: string) {
	for (let current = scope; current; current = current.parent) {
		if (t.CatchClause.check(current.node) && !current.node.param) {
			continue;
		}
		if (current.declares(name)) {
			return current;
		}
	}
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

function readPackageScope(
	projectPath: string
): PackageJSON & { type?: string } {
	const packagePath = up("package.json", { cwd: projectPath });
	return packagePath
		? parsePackageJSON(readFileSync(packagePath), packagePath)
		: {};
}

/** Checks whether Vite's bundle loader treats ordinary .js and .ts configs as ESM. */
export function hasEsmPackageScope(projectPath: string): boolean {
	return readPackageScope(projectPath).type === "module";
}

/** Whether the project's dev and build scripts both load the default JS config natively. */
export function usesNativeJsViteConfig(
	projectPath: string,
	target: AutoConfigTarget = "cf"
): boolean {
	const { type, scripts, dependencies, devDependencies } =
		readPackageScope(projectPath);
	const [major, minor] = process.versions.node.split(".").map(Number);
	return (
		type === undefined &&
		(target === "wrangler" ||
			(!dependencies?.["vite-plus"] && !devDependencies?.["vite-plus"])) &&
		(major > 22 || (major === 22 && minor >= 7)) &&
		usesNativeViteLoader(scripts?.dev, "dev") &&
		usesNativeViteLoader(scripts?.build, "build")
	);
}

function usesNativeViteLoader(
	script: unknown,
	command: "dev" | "build"
): boolean {
	if (
		typeof script !== "string" ||
		!/^[\w\t ./=:@,+-]+(?:&&[\w\t ./=:@,+-]+)*$/.test(script)
	) {
		return false;
	}
	const commands = script
		.split("&&")
		.map((part) => part.trim().split(/[ \t]+/));
	const viteCommand = commands.pop();
	if (
		!viteCommand ||
		!commands.every(isOneShotTypeScriptCommand) ||
		viteCommand.shift() !== "vite"
	) {
		return false;
	}
	if (command === "build") {
		if (viteCommand.shift() !== "build") {
			return false;
		}
	} else if (["dev", "serve"].includes(viteCommand[0])) {
		viteCommand.shift();
	}
	let native = false;
	for (let index = 0; index < viteCommand.length; index++) {
		const argument = viteCommand[index];
		if (
			argument === "--configLoader" ||
			argument.startsWith("--configLoader=")
		) {
			if (
				native ||
				(argument === "--configLoader"
					? viteCommand[++index] !== "native"
					: argument !== "--configLoader=native")
			) {
				return false;
			}
			native = true;
		} else if (
			/^(?:--(?:base|debug|filter|logLevel|mode)|-[dflm])(?:=.+)?$/.test(
				argument
			) ||
			(command === "dev"
				? /^--(?:host|open|port)(?:=.+)?$/
				: /^--(?:assetsDir|assetsInlineLimit|manifest|minify|outDir|sourcemap|ssr|ssrManifest|target)(?:=.+)?$/
			).test(argument)
		) {
			if (
				!argument.includes("=") &&
				viteCommand[index + 1] &&
				!viteCommand[index + 1].startsWith("-")
			) {
				index++;
			}
		} else if (
			!/^--(?:clearScreen|profile)$/.test(argument) &&
			!(
				command === "dev"
					? /^--(?:strictPort|force|cors)$/
					: /^--(?:app|emptyOutDir)$/
			).test(argument)
		) {
			return false;
		}
	}
	return native;
}

function isOneShotTypeScriptCommand([name, ...args]: string[]): boolean {
	if (
		name !== "tsc" ||
		args.some((argument) => /^@|^(?:--watch|-w)=/i.test(argument))
	) {
		return false;
	}
	const lastWatch = args.findLastIndex((argument) =>
		/^(?:--watch|-w)$/i.test(argument)
	);
	return lastWatch === -1 || args[lastWatch + 1] === "false";
}

interface ViteConfigTransformOptions {
	target?: AutoConfigTarget;
	viteEnvironmentName?: string;
	incompatibleVitePlugins?: string[];
}
export function transformViteConfig(
	projectPath: string,
	options: ViteConfigTransformOptions = {}
) {
	const filePath = getViteConfigPath(projectPath);
	const contents = renderViteConfig(filePath, options, {
		target: options.target ?? "wrangler",
	});
	if (contents !== undefined) {
		writeFileSync(filePath, contents);
	}
}

/** Validates a plain Vite rewrite without writing files, unless apply is requested. */
export function configureViteConfig(
	projectPath: string,
	apply: boolean,
	target: AutoConfigTarget
): void {
	const filePath = getViteConfigPath(projectPath);
	const contents = renderViteConfig(filePath, {}, { plainVite: true, target });
	if (contents === undefined) {
		throw unsupportedViteConfig();
	}
	if (apply) {
		writeFileSync(filePath, contents);
	}
}

function unsupportedViteConfig(): UserError {
	return new UserError(
		"Cannot modify Vite config: could not find a supported defineConfig() call as the default export. Export a Vite defineConfig() call with an inline config object or add the Cloudflare plugin manually.",
		{ telemetryMessage: "autoconfig vite config object unsupported" }
	);
}

function isValueImport(
	specifier: types.ASTNode
): specifier is types.namedTypes.ImportSpecifier {
	return (
		t.ImportSpecifier.check(specifier) &&
		!("importKind" in specifier && specifier.importKind === "type")
	);
}

const VITE_CONFIG_HELPER_MODULES = ["vite", "vite-plus", "vitest/config"];

function getImportedNames(
	program: types.namedTypes.Program,
	modules: string[],
	imported: string
): Set<string> {
	const imports = program.body.flatMap((statement) => {
		if (
			!t.ImportDeclaration.check(statement) ||
			!modules.includes(String(statement.source.value)) ||
			statement.importKind === "type"
		) {
			return [];
		}
		return (
			statement.specifiers?.filter(
				(specifier) =>
					isValueImport(specifier) && specifier.imported.name === imported
			) ?? []
		);
	});
	return new Set(
		imports.flatMap((specifier) =>
			t.Identifier.check(specifier.local) ? [specifier.local.name] : []
		)
	);
}

function getExportedViteCall(program: types.namedTypes.Program) {
	const names = getImportedNames(
		program,
		VITE_CONFIG_HELPER_MODULES,
		"defineConfig"
	);
	const exported = program.body.find((statement) =>
		t.ExportDefaultDeclaration.check(statement)
	);
	let expression = exported?.declaration;
	while (
		t.TSAsExpression.check(expression) ||
		t.TSSatisfiesExpression.check(expression) ||
		t.TSTypeAssertion.check(expression) ||
		t.TSNonNullExpression.check(expression)
	) {
		expression = expression.expression;
	}
	if (
		t.CallExpression.check(expression) &&
		t.Identifier.check(expression.callee) &&
		names.has(expression.callee.name)
	) {
		return expression;
	}
	throw unsupportedViteConfig();
}

function validateViteCallback(config: types.ASTNode): void {
	if (
		(t.ArrowFunctionExpression.check(config) ||
			t.FunctionExpression.check(config)) &&
		t.BlockStatement.check(config.body)
	) {
		let returnCount = 0;
		recast.visit(config.body, {
			visitFunction() {
				return false;
			},
			visitReturnStatement() {
				returnCount++;
				return false;
			},
		});
		if (returnCount > 1) {
			throw new UserError(
				"Cannot modify Vite config: the config callback has multiple return paths. Return a single config object or add the Cloudflare plugin manually.",
				{ telemetryMessage: "autoconfig vite config object unsupported" }
			);
		}
	}
}

function renderViteConfig(
	filePath: string,
	options: ViteConfigTransformOptions,
	{ plainVite = false, target = "cf" as AutoConfigTarget } = {}
): string | undefined {
	const extension = path.extname(filePath);
	const projectPath = path.dirname(filePath);
	const bundleAsCommonJs =
		[".js", ".ts"].includes(extension) &&
		(plainVite
			? !hasEsmPackageScope(projectPath)
			: !isModulePackage(projectPath)) &&
		!(
			plainVite &&
			extension === ".js" &&
			usesNativeJsViteConfig(projectPath, target)
		);
	if (
		[".cjs", ".cts"].includes(extension) ||
		(plainVite && bundleAsCommonJs && target !== "cf")
	) {
		throw new UserError(
			"Cannot automatically modify a CommonJS Vite configuration. Convert it to ESM (import/export) in vite.config.mjs or vite.config.mts before adding the Cloudflare plugin.",
			{ telemetryMessage: "autoconfig CommonJS vite config unsupported" }
		);
	}
	let deferPluginImport = target === "cf" && bundleAsCommonJs;
	const ast = parseFile(filePath);
	if (!ast) {
		return;
	}
	const removedIncompatiblePlugins = new Set<string>();
	let exportedCall: types.namedTypes.CallExpression | undefined;
	let pluginName = "cloudflare";
	let programScope: recast.types.NodePath["scope"];

	recast.visit(ast, {
		visitProgram(n) {
			if (plainVite) {
				programScope = n.scope;
				exportedCall = getExportedViteCall(n.node);
				validateViteCallback(exportedCall.arguments[0]);
			}
			// Add an import of the @cloudflare/vite-plugin
			// ```
			// import {cloudflare} from "@cloudflare/vite-plugin";
			// ```
			const lastImportIndex = n.node.body.findLastIndex(
				(statement) => statement.type === "ImportDeclaration"
			);

			// Only import if not already imported
			const pluginImports = n.node.body.filter(
				(s): s is types.namedTypes.ImportDeclaration =>
					t.ImportDeclaration.check(s) &&
					s.source.value === "@cloudflare/vite-plugin" &&
					(!plainVite ||
						(s.importKind !== "type" &&
							(s.specifiers ?? []).some(
								(specifier) =>
									!t.ImportSpecifier.check(specifier) ||
									isValueImport(specifier)
							)))
			);
			if (plainVite && deferPluginImport && pluginImports.length > 0) {
				throw new UserError(
					"Cannot automatically modify a CommonJS Vite configuration with a static Cloudflare plugin import. Convert it to ESM in vite.config.mjs or vite.config.mts before retrying.",
					{
						telemetryMessage:
							"autoconfig CommonJS vite plugin import unsupported",
					}
				);
			}
			if (pluginImports.length > 0) {
				deferPluginImport = false;
			}
			if (plainVite && pluginImports.length > 0) {
				const existing = pluginImports
					.flatMap((declaration) =>
						declaration.importKind === "type"
							? []
							: (declaration.specifiers ?? [])
					)
					.find(
						(specifier): specifier is types.namedTypes.ImportSpecifier =>
							isValueImport(specifier) &&
							specifier.imported.name === "cloudflare"
					);
				if (!t.Identifier.check(existing?.local)) {
					throw new UserError(
						"Cannot modify Vite config: use a named cloudflare import from @cloudflare/vite-plugin or add the plugin manually.",
						{ telemetryMessage: "autoconfig vite plugin import unsupported" }
					);
				}
				pluginName = existing.local.name;
			}
			if (pluginImports.length === 0 && !deferPluginImport) {
				if (plainVite) {
					const identifiers = new Set<string>();
					recast.visit(n.node, {
						visitIdentifier(identifier) {
							identifiers.add(identifier.node.name);
							return false;
						},
					});
					for (let suffix = 2; identifiers.has(pluginName); suffix++) {
						pluginName = `cloudflare${suffix}`;
					}
				}
				n.node.body.splice(
					lastImportIndex + 1,
					0,
					b.importDeclaration(
						[
							b.importSpecifier(
								b.identifier("cloudflare"),
								b.identifier(pluginName)
							),
						],
						b.stringLiteral("@cloudflare/vite-plugin")
					)
				);
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
			if (
				plainVite ? n.node !== exportedCall : callee.name !== "defineConfig"
			) {
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
			if (plainVite) {
				const callback = n.get("arguments", 0);
				const bindingScope = deferPluginImport
					? undefined
					: lookupBinding(callback.scope, pluginName);
				if (bindingScope && bindingScope !== programScope) {
					throw new UserError(
						`Cannot modify Vite config: the config callback shadows the Cloudflare plugin import (${pluginName}). Rename the local binding or add the plugin manually.`,
						{ telemetryMessage: "autoconfig vite plugin import shadowed" }
					);
				}
			}

			let pluginsProp = configObject.properties.findLast((prop) =>
				isPluginsProp(prop)
			);
			if (plainVite && !pluginsProp) {
				if (
					configObject.properties.some((prop) => {
						const name = getStaticPropertyName(prop);
						return name === undefined || name === "plugins";
					})
				) {
					throw new UserError(
						"Cannot modify Vite config: an existing property may supply plugins. Define an explicit plugins array after spreads and computed properties, or add the Cloudflare plugin manually.",
						{ telemetryMessage: "autoconfig vite plugins array overridden" }
					);
				}
				pluginsProp = b.objectProperty(
					b.identifier("plugins"),
					b.arrayExpression([])
				);
				configObject.properties.push(pluginsProp);
			}
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
						isDeferredCloudflarePlugin(el) ||
						(!deferPluginImport &&
							el?.type === "CallExpression" &&
							el.callee.type === "Identifier" &&
							el.callee.name === pluginName)
				)
			) {
				const plugin = b.identifier("plugin");
				const cloudflare = b.identifier(
					deferPluginImport ? "cloudflare" : pluginName
				);
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
	return recast.print(ast).code;
}

function isModulePackage(projectPath: string): boolean {
	const manifestPath = path.join(projectPath, "package.json");
	if (!existsSync(manifestPath)) {
		return false;
	}
	const manifest = parsePackageJSON(readFileSync(manifestPath), manifestPath);
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
