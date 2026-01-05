import { runFrameworkGenerator } from "frameworks/index";
import { detectPackageManager } from "helpers/packageManagers";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [
		"--project-name",
		ctx.project.name,
		// Note: we could point the waku create CLI to a cloudflare-ready template, that works great
		//       but here we don't want to use that because we do want to exercise the general
		//       autoconfig/`wrangler setup` functionality (which amongst other things lets up ensure
		//       that we can support the migration of existing waku projects)
	]);
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "waku",
	frameworkCli: "create-waku",
	platform: "workers",
	displayName: "Waku",
	generate,
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
