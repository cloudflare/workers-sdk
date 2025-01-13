import { runFrameworkGenerator } from "frameworks/index";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [ctx.project.name]);
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "vue",
	frameworkCli: "create-vue",
	displayName: "Vue",
	platform: "pages",
	generate,
	transformPackageJson: async (_, ctx) => ({
		scripts: {
			deploy: `${ctx.packageManager.npm} run build && wrangler pages deploy ./dist`,
			preview: `${ctx.packageManager.npm} run build && wrangler pages dev ./dist`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
