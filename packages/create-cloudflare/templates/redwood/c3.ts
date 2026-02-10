import { logRaw } from "@cloudflare/cli";
import { runFrameworkGenerator } from "frameworks/index";
import { detectPackageManager } from "helpers/packageManagers";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [ctx.project.name]);

	logRaw("");
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "redwood",
	platform: "workers",
	frameworkCli: "create-rwsdk",
	displayName: "RedwoodSDK",
	generate,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `${npm} run release`,
			preview: `${npm} run build && wrangler dev`,
			"cf-typegen": `wrangler types`,
		},
	}),
	devScript: "dev",
	deployScript: "release",
	previewScript: "preview",
};
export default config;
