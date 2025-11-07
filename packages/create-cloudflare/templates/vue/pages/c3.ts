import type { C3Context } from "types";

import { runFrameworkGenerator } from "frameworks/index";
import { detectPackageManager } from "helpers/packageManagers";

import type { TemplateConfig } from "../../../src/templates";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [ctx.project.name]);
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "vue",
	frameworkCli: "create-vue",
	displayName: "Vue",
	platform: "pages",
	hidden: true,
	path: "templates/vue/pages",
	copyFiles: { path: "./templates" },
	generate,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `${npm} run build && wrangler pages deploy`,
			preview: `${npm} run build && wrangler pages dev`,
			"cf-typegen": `wrangler types`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
