import assert from "node:assert";
import { existsSync } from "node:fs";
import path from "node:path";
import { brandColor, dim } from "@cloudflare/cli/colors";
import * as recast from "recast";
import { transformFile } from "../c3-vendor/codemod";
import { installPackages } from "../c3-vendor/packages";
import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";
import type { types } from "recast";

const b = recast.types.builders;
const t = recast.types.namedTypes;

function isPluginsProp(
	prop: unknown
): prop is types.namedTypes.ObjectProperty | types.namedTypes.Property {
	return (
		(t.Property.check(prop) || t.ObjectProperty.check(prop)) &&
		t.Identifier.check(prop.key) &&
		prop.key.name === "plugins"
	);
}

function transformViteConfig(projectPath: string) {
	const filePathTS = path.join(projectPath, `vite.config.ts`);
	const filePathJS = path.join(projectPath, `vite.config.ts`);

	let filePath: string;

	if (existsSync(filePathTS)) {
		filePath = filePathTS;
	} else if (existsSync(filePathJS)) {
		filePath = filePathJS;
	} else {
		throw new Error("Could not find Vite config file to modify");
	}

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
			const callee = n.node.callee as types.namedTypes.Identifier;
			if (callee.name !== "defineConfig") {
				return this.traverse(n);
			}

			const config = n.node.arguments[0];
			assert(t.ObjectExpression.check(config));
			const pluginsProp = config.properties.find((prop) => isPluginsProp(prop));
			assert(pluginsProp && t.ArrayExpression.check(pluginsProp.value));

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
						b.objectExpression([
							b.objectProperty(
								b.identifier("viteEnvironment"),
								b.objectExpression([
									b.objectProperty(
										b.identifier("name"),
										b.stringLiteral("ssr")
									),
								])
							),
						]),
					])
				);
			}

			// Remove nitro or netlify plugins, as they conflict
			//  nitro(), nitroV2Plugin(), netlify()
			pluginsProp.value.elements = pluginsProp.value.elements.filter((el) => {
				if (
					el?.type === "CallExpression" &&
					el.callee.type === "Identifier" &&
					["nitro", "nitroV2Plugin", "netlify"].includes(el.callee.name)
				) {
					return false;
				}
				return true;
			});
			return false;
		},
	});
}

export class TanstackStart extends Framework {
	async configure({
		dryRun,
		projectPath,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (!dryRun) {
			await installPackages(["@cloudflare/vite-plugin"], {
				dev: true,
				startText: "Installing the Cloudflare Vite plugin",
				doneText: `${brandColor(`installed`)} ${dim("@cloudflare/vite-plugin")}`,
			});

			transformViteConfig(projectPath);
		}

		return {
			wranglerConfig: {
				compatibility_flags: ["nodejs_compat"],
				main: "@tanstack/react-start/server-entry",
			},
		};
	}

	configurationDescription = "Configuring project for Tanstack Start";
}
