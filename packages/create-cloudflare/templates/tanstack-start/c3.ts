import { logRaw } from "@cloudflare/cli";
import { runFrameworkGenerator } from "frameworks/index";
import { detectPackageManager } from "helpers/packageManagers";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--deployment",
		"cloudflare",
		"--framework",
		"react",
		// to prevent asking about git twice, just let c3 do it
		"--no-git",
	]);

	logRaw(""); // newline
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "tanstack-start",
	platform: "workers",
	frameworkCli: "@tanstack/create-start",
	displayName: "TanStack Start",
	generate,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `${npm} run build && wrangler deploy`,
			preview: `${npm} run build && vite preview`,
			"cf-typegen": `wrangler types`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
