import { runFrameworkGenerator } from "frameworks/index";
import { detectPackageManager } from "helpers/packageManagers";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [
		"--project-name",
		ctx.project.name,
		"--template",
		"07_cloudflare",
	]);
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "waku",
	frameworkCli: "create-waku",
	platform: "workers",
	displayName: "Waku",
	path: "templates/waku",
	generate,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `${npm} run build && wrangler deploy`,
			preview: `NODE_ENV=production ${npm} run build && wrangler dev`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
