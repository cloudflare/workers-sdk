import { logRaw } from "@cloudflare/cli";
import { runFrameworkGenerator } from "frameworks/index";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--cloudflare",
		// to prevent asking about git twice, just let c3 do it
		"--no-git",
	]);

	logRaw(""); // newline
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "vike",
	platform: "workers",
	frameworkCli: "create-vike",
	displayName: "Vike",
	generate,
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
	transformPackageJson: async () => ({
		scripts: {
			"cf-typegen": `wrangler types`,
		},
	}),
};
export default config;
