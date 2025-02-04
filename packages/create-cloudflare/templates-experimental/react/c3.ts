import assert from "assert";
import { logRaw } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { inputPrompt, spinner } from "@cloudflare/cli/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import {
	getPropertyName,
	mergeObjectProperties,
	transformFile,
} from "helpers/codemod";
import { readJSON, usesTypescript, writeJSON } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import { installPackages } from "helpers/packages";
import * as recast from "recast";
import type { TemplateConfig } from "../../src/templates";
import type { types } from "recast";
import type { C3Context } from "types";

const b = recast.types.builders;
const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	const variant = await getVariant();
	ctx.args.lang = variant.lang;

	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--template",
		variant?.value,
	]);

	logRaw("");
};

const configure = async (ctx: C3Context) => {
	await installPackages(["@cloudflare/vite-plugin"], {
		dev: true,
		startText: "Installing the Cloudflare Vite plugin",
		doneText: `${brandColor(`updated`)} ${dim("wrangler@latest")}`,
	});

	await transformViteConfig(ctx);

	if (usesTypescript(ctx)) {
		updateTsconfigJson();
	}
};

function transformViteConfig(ctx: C3Context) {
	const filePath = `vite.config.${usesTypescript(ctx) ? "ts" : "js"}`;

	transformFile(filePath, {
		visitProgram(n) {
			// Add an import of the @cloudflare/vite-plugin
			// ```
			// import {cloudflare} from "@cloudflare/vite-plugin";
			// ```
			const lastImportIndex = n.node.body.findLastIndex(
				(t) => t.type === "ImportDeclaration",
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

			const config = n.node.arguments[0] as types.namedTypes.ObjectExpression;

			const pluginsProp = config.properties.find(
				(prop) =>
					prop.type === "ObjectProperty" && getPropertyName(prop) === "plugins",
			) as types.namedTypes.ObjectProperty;
			const pluginsArray =
				pluginsProp.value as types.namedTypes.ArrayExpression;

			mergeObjectProperties(
				n.node.arguments[0] as types.namedTypes.ObjectExpression,
				[
					b.objectProperty(
						b.identifier("plugins"),
						b.arrayExpression([
							...pluginsArray.elements,
							b.callExpression(b.identifier("cloudflare"), []),
						]),
					),
				],
			);

			return false;
		},
	});
}

function updateTsconfigJson() {
	const s = spinner();
	s.start(`Updating tsconfig.json config`);
	// Add a reference to the extra tsconfig.worker.json file.
	// ```
	// "references": [ ..., { path: "./tsconfig.worker.json" } ]
	// ```
	const tsconfig = readJSON("tsconfig.json") as { references: object[] };
	if (tsconfig && typeof tsconfig === "object") {
		tsconfig.references ??= [];
		tsconfig.references.push({ path: "./tsconfig.worker.json" });
	}
	writeJSON("tsconfig.json", tsconfig);
	s.stop(`${brandColor(`updated`)} ${dim(`\`angular.json\``)}`);
}

async function getVariant() {
	const variantsOptions = [
		{
			value: "react-ts",
			lang: "ts",
			label: "TypeScript",
		},
		{
			value: "react-swc-ts",
			lang: "ts",
			label: "TypeScript + SWC",
		},
		{
			value: "react",
			lang: "js",
			label: "JavaScript",
		},
		{
			value: "react-swc",
			lang: "js",
			label: "JavaScript + SWC",
		},
	];
	const value = await inputPrompt({
		type: "select",
		question: "Select a variant:",
		label: "variant",
		options: variantsOptions,
		defaultValue: variantsOptions[0].value,
	});

	const selected = variantsOptions.find((variant) => variant.value === value);
	assert(selected, "Expected a variant to be selected");
	return selected;
}

const config: TemplateConfig = {
	configVersion: 1,
	id: "react",
	frameworkCli: "create-vite",
	displayName: "React",
	platform: "workers",
	path: "templates-experimental/react",
	copyFiles: {
		variants: {
			ts: {
				path: "./ts",
			},
			js: {
				path: "./js",
			},
		},
	},
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `${npm} run build && wrangler deploy`,
			preview: `${npm} run build && vite preview`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
