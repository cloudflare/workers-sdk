import assert from "node:assert";
import { logRaw } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { runFrameworkGenerator } from "frameworks/index";
import { transformFile } from "helpers/codemod";
import { detectPackageManager } from "helpers/packageManagers";
import { installPackages } from "helpers/packages";
import * as recast from "recast";
import type { TemplateConfig } from "../../src/templates";
import type { types } from "recast";
import type { C3Context } from "types";

const b = recast.types.builders;
const t = recast.types.namedTypes;
const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--framework",
		"react",
		// to prevent asking about git twice, just let c3 do it
		"--no-git",
	]);

	logRaw(""); // newline
};

const configure = async () => {
	await installPackages(["@cloudflare/vite-plugin"], {
		dev: true,
		startText: "Installing the Cloudflare Vite plugin",
		doneText: `${brandColor(`installed`)} ${dim("@cloudflare/vite-plugin")}`,
	});

	updateViteConfig();
};

const updateViteConfig = () => {
	const filePath = "vite.config.ts";

	transformFile(filePath, {
		visitProgram(n) {
			// Add an import of the @cloudflare/vite-plugin
			// ```
			// import {cloudflare} from "@cloudflare/vite-plugin";
			// ```
			const lastImportIndex = n.node.body.findLastIndex(
				(statement) => statement.type === "ImportDeclaration",
			);
			const lastImport = n.get("body", lastImportIndex);
			const importAst = b.importDeclaration(
				[b.importSpecifier(b.identifier("cloudflare"))],
				b.stringLiteral("@cloudflare/vite-plugin"),
			);
			lastImport.insertAfter(importAst);

			return this.traverse(n);
		},
		visitCallExpression: function (n) {
			// Add the imported plugin to the config
			// ```
			// defineConfig({
			//   plugins: [react(), cloudflare()],
			// });
			const callee = n.node.callee as types.namedTypes.Identifier;
			if (callee.name !== "defineConfig") {
				return this.traverse(n);
			}

			const config = n.node.arguments[0];
			assert(t.ObjectExpression.check(config));
			const pluginsProp = config.properties.find((prop) => isPluginsProp(prop));
			assert(pluginsProp && t.ArrayExpression.check(pluginsProp.value));
			pluginsProp.value.elements.push(
				b.callExpression(b.identifier("cloudflare"), [
					b.objectExpression([
						b.objectProperty(
							b.identifier("viteEnvironment"),
							b.objectExpression([
								b.objectProperty(b.identifier("name"), b.literal("ssr")),
							]),
						),
					]),
				]),
			);

			return false;
		},
	});
};

function isPluginsProp(
	prop: unknown,
): prop is types.namedTypes.ObjectProperty | types.namedTypes.Property {
	return (
		(t.Property.check(prop) || t.ObjectProperty.check(prop)) &&
		t.Identifier.check(prop.key) &&
		prop.key.name === "plugins"
	);
}

const config: TemplateConfig = {
	configVersion: 1,
	id: "tanstack",
	platform: "workers",
	frameworkCli: "@tanstack/create-start",
	displayName: "TanStack Start",
	generate,
	configure,
	copyFiles: {
		path: "./templates",
	},
	transformPackageJson: async () => ({
		scripts: {
			deploy: `${npm} run build && wrangler deploy`,
			preview: `${npm} run build && vite preview`,
			"cf-typegen": `wrangler types`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
