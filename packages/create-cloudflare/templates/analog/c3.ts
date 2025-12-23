import { logRaw, updateStatus } from "@cloudflare/cli";
import { blue } from "@cloudflare/cli/colors";
import { runFrameworkGenerator } from "frameworks/index";
import { mergeObjectProperties, transformFile } from "helpers/codemod";
import { getWorkerdCompatibilityDate } from "helpers/compatDate";
import { usesTypescript } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import * as recast from "recast";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [ctx.project.name, "--template=latest"]);
	logRaw("");
};

const configure = async (ctx: C3Context) => {
	usesTypescript(ctx);
	const filePath = `vite.config.${usesTypescript(ctx) ? "ts" : "js"}`;

	const compatDate = getWorkerdCompatibilityDate(ctx.project.path);

	updateStatus(`Updating configuration in ${blue(filePath)}`);

	transformFile(filePath, {
		visitCallExpression: function (n) {
			const callee = n.node.callee as recast.types.namedTypes.Identifier;
			if (callee.name !== "analog") {
				return this.traverse(n);
			}

			const b = recast.types.builders;
			const presetDef = [
				b.objectProperty(
					b.identifier("nitro"),
					b.objectExpression([
						// preset: "cloudflare_module"
						b.objectProperty(
							b.identifier("preset"),
							b.stringLiteral("cloudflare_module"),
						),
						b.objectProperty(
							b.identifier("compatibilityDate"),
							b.stringLiteral(compatDate),
						),
					]),
				),
			];

			if (n.node.arguments.length === 0) {
				n.node.arguments.push(b.objectExpression(presetDef));
			} else {
				mergeObjectProperties(
					n.node.arguments[0] as recast.types.namedTypes.ObjectExpression,
					presetDef,
				);
			}

			return false;
		},
	});
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "analog",
	frameworkCli: "create-analog",
	displayName: "Analog",
	platform: "workers",
	copyFiles: {
		path: "./templates",
	},
	path: "templates/analog",
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			preview: `${npm} run build && wrangler dev`,
			deploy: `${npm} run build && wrangler deploy`,
			"cf-typegen": `wrangler types`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
