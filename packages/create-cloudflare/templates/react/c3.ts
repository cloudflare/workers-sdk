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
	id: "react",
	displayName: "React",
	platform: "pages",
	generate,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `${npm} run build && wrangler pages deploy ./build`,
			preview: `${npm} run build && wrangler pages dev ./build`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
