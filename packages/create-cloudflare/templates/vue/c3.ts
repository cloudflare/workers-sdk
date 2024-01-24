import { runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [ctx.project.name]);
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "vue",
	displayName: "Vue",
	platform: "pages",
	generate,
	transformPackageJson: async () => ({
		scripts: {
			"pages:dev": `wrangler pages dev ${await compatDateFlag()} --proxy 5173 -- ${npm} run dev`,
			"pages:deploy": `${npm} run build && wrangler pages deploy ./dist`,
		},
	}),
	testFlags: ["--ts"],
};
export default config;
