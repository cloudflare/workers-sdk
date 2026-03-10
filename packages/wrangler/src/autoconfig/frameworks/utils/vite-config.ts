import { existsSync } from "node:fs";
import path from "node:path";
import { UserError } from "@cloudflare/workers-utils";
import * as recast from "recast";
import dedent from "ts-dedent";
import { logger } from "../../../logger";
import { transformFile } from "../../c3-vendor/codemod";
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
 */
function extractConfigObject(
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

export function checkIfViteConfigUsesCloudflarePlugin(
	projectPath: string
): boolean {
	const filePath = getViteConfigPath(projectPath);

	let importsCloudflarePlugin = false;
	let usesCloudflarePlugin = false;

	transformFile(filePath, {
		visitProgram(n) {
			if (
				n.node.body.some(
					(s) =>
						s.type === "ImportDeclaration" &&
						s.source.value === "@cloudflare/vite-plugin"
				)
			) {
				importsCloudflarePlugin = true;
				return this.traverse(n);
			}

			this.traverse(n);
		},
		visitCallExpression: function (n) {
			const callee = n.node.callee as types.namedTypes.Identifier;
			if (callee.name !== "defineConfig") {
				return this.traverse(n);
			}

			const configObject = extractConfigObject(n.node.arguments[0]);
			if (!configObject) {
				logger.debug(
					`Vite config uses an unsupported expression type. Skipping Cloudflare plugin check.`
				);
				return this.traverse(n);
			}

			const pluginsProp = configObject.properties.find((prop) =>
				isPluginsProp(prop)
			);
			if (!pluginsProp || !t.ArrayExpression.check(pluginsProp.value)) {
				logger.debug(
					`Vite config does not have a valid plugins array. Skipping Cloudflare plugin check.`
				);
				return this.traverse(n);
			}

			if (
				pluginsProp.value.elements.some(
					(el) =>
						el?.type === "CallExpression" &&
						el.callee.type === "Identifier" &&
						el.callee.name === "cloudflare"
				)
			) {
				usesCloudflarePlugin = true;
				return this.traverse(n);
			}

			this.traverse(n);
		},
	});

	return importsCloudflarePlugin && usesCloudflarePlugin;
}

function getViteConfigPath(projectPath: string): string {
	const filePathTS = path.join(projectPath, `vite.config.ts`);
	const filePathJS = path.join(projectPath, `vite.config.js`);

	let filePath: string;

	if (existsSync(filePathTS)) {
		filePath = filePathTS;
	} else if (existsSync(filePathJS)) {
		filePath = filePathJS;
	} else {
		throw new Error("Could not find Vite config file to modify");
	}

	return filePath;
}

/**
 * Name of vite plugins that we know are incompatible with the Cloudflare one
 */
const knownIncompatiblePlugins = ["nitro", "nitroV2Plugin", "netlify"];

export function transformViteConfig(
	projectPath: string,
	options: {
		viteEnvironmentName?: string;
		incompatibleVitePlugins?: string[];
	} = {}
) {
	const filePath = getViteConfigPath(projectPath);

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

			return this.traverse(n);
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
				throw new UserError(dedent`
					Cannot modify Vite config: could not extract a config object (found ${argType}).

					The Cloudflare plugin can only be automatically added to Vite configs that use:
					  - A simple object: defineConfig({ plugins: [...] })
					  - An arrow function returning an object: defineConfig(() => ({ plugins: [...] }))

					If your config uses a more complex pattern, please manually add the plugin:

					  import { cloudflare } from "@cloudflare/vite-plugin";

					  export default defineConfig({
					    plugins: [cloudflare()]
					  });
				`);
			}

			const pluginsProp = configObject.properties.find((prop) =>
				isPluginsProp(prop)
			);
			if (!pluginsProp || !t.ArrayExpression.check(pluginsProp.value)) {
				throw new UserError(dedent`
					Cannot modify Vite config: could not find a valid plugins array.

					Please ensure your Vite config has a plugins array:

					  export default defineConfig({
					    plugins: []
					  });
				`);
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
		t.Identifier.check(prop.key) &&
		prop.key.name === "plugins"
	);
}
