import assert from "node:assert";
import { logRaw } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { inputPrompt, spinner } from "@cloudflare/cli/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { transformFile } from "helpers/codemod";
import { readJSON, usesTypescript, writeJSON } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import { installPackages } from "helpers/packages";
import * as recast from "recast";
import type { TemplateConfig } from "../../../src/templates";
import type { types } from "recast";
import type { C3Context } from "types";

const b = recast.types.builders;
const t = recast.types.namedTypes;
const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	const variant = await getVariant(ctx);
	ctx.args.lang = variant.lang;

	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--template",
		variant.value,
	]);

	logRaw("");
};

const configure = async (ctx: C3Context) => {
	await installPackages(["@cloudflare/vite-plugin"], {
		dev: true,
		startText: "Installing the Cloudflare Vite plugin",
		doneText: `${brandColor(`installed`)} ${dim("@cloudflare/vite-plugin")}`,
	});

	transformViteConfig(ctx);

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
				b.callExpression(b.identifier("cloudflare"), []),
			);

			return false;
		},
	});
}

function isPluginsProp(
	prop: unknown,
): prop is types.namedTypes.ObjectProperty | types.namedTypes.Property {
	return (
		(t.Property.check(prop) || t.ObjectProperty.check(prop)) &&
		t.Identifier.check(prop.key) &&
		prop.key.name === "plugins"
	);
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
	s.stop(`${brandColor(`updated`)} ${dim(`\`tsconfig.json\``)}`);
}

async function getVariant(ctx: C3Context) {
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

	// If variant is provided via CLI args, use it directly
	if (ctx.args.variant) {
		const selected = variantsOptions.find(
			(variant) => variant.value === ctx.args.variant,
		);
		if (!selected) {
			throw new Error(
				`Unknown variant "${ctx.args.variant}". Valid variants are: ${variantsOptions.map((v) => v.value).join(", ")}`,
			);
		}
		return selected;
	}

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
	path: "templates/react/workers",
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
	transformPackageJson: async (_, ctx) => ({
		scripts: {
			deploy: `${npm} run build && wrangler deploy`,
			preview: `${npm} run build && vite preview`,
			...(usesTypescript(ctx) && { "cf-typegen": `wrangler types` }),
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
