import { logRaw, updateStatus } from "@cloudflare/cli";
import { blue } from "@cloudflare/cli/colors";
import { mergeObjectProperties, transformFile } from "@cloudflare/codemod";
import { runFrameworkGenerator } from "frameworks/index";
import { usesTypescript } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import * as recast from "recast";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	// Run the create-solid command
	// -s flag forces solid-start
	await runFrameworkGenerator(ctx, ["-p", ctx.project.name, "-s"]);

	logRaw("");
};

const configure = async (ctx: C3Context) => {
	usesTypescript(ctx);
	const filePath = `vite.config.${usesTypescript(ctx) ? "ts" : "js"}`;

	updateStatus(`Updating configuration in ${blue(filePath)}`);

	transformFile(filePath, {
		visitCallExpression: function (n) {
			const callee = n.node.callee as recast.types.namedTypes.Identifier;
			if (callee.name !== "nitro") {
				return this.traverse(n);
			}

			const b = recast.types.builders;
			const presetProp = b.objectProperty(
				b.identifier("preset"),
				b.stringLiteral("cloudflare-module")
			);

			if (n.node.arguments.length === 0) {
				n.node.arguments.push(b.objectExpression([presetProp]));
			} else {
				mergeObjectProperties(
					n.node.arguments[0] as recast.types.namedTypes.ObjectExpression,
					[presetProp]
				);
			}

			return false;
		},
	});
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "solid",
	frameworkCli: "create-solid",
	displayName: "SolidStart",
	platform: "workers",
	copyFiles: {
		path: "./templates",
	},
	path: "templates/solid",
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			preview: `${npm} run build && npx wrangler dev`,
			deploy: `${npm} run build && wrangler deploy`,
			"cf-typegen": `wrangler types`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
