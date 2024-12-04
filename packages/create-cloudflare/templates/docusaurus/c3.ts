import { runFrameworkGenerator } from "frameworks/index";
import { detectPackageManager } from "helpers/packageManagers";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [ctx.project.name, "classic"]);
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "docusaurus",
	frameworkCli: "create-docusaurus",
	platform: "pages",
	displayName: "Docusaurus",
	generate,
	transformPackageJson: async () => ({
		scripts: {
			preview: `${npm} run build && wrangler pages dev ./build`,
			deploy: `${npm} run build && wrangler pages deploy ./build`,
		},
	}),
	devScript: "preview",
	deployScript: "deploy",
};
export default config;
