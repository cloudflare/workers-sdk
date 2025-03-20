import { logRaw } from "@cloudflare/cli";
import { runFrameworkGenerator } from "frameworks/index";
import { detectPackageManager } from "helpers/packageManagers";
import type { TemplateConfig } from "../../../src/templates";
import type { C3Context } from "types";

const generate = async (ctx: C3Context) => {
	const { name: pm } = detectPackageManager();

	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--template",
		"cloudflare-pages",
		"--install",
		"--pm",
		pm,
	]);

	logRaw(""); // newline
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "hono",
	frameworkCli: "create-hono",
	displayName: "Hono",
	copyFiles: {
		path: "./templates",
	},
	path: "templates/hono/pages",
	platform: "pages",
	generate,
	transformPackageJson: async () => ({
		scripts: {
			"cf-typegen": "wrangler types --env-interface CloudflareBindings",
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "dev",
};
export default config;
