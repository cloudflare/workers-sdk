import { logRaw } from "@cloudflare/cli";
import { runFrameworkGenerator } from "frameworks/index";
import { detectPackageManager } from "helpers/packageManagers";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const generate = async (ctx: C3Context) => {
	const { name: pm } = detectPackageManager();

	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--template",
		"cloudflare-workers",
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
	platform: "workers",
	path: "templates-experimental/hono",
	generate,
	transformPackageJson: async () => ({
		scripts: {
			dev: "wrangler dev",
			deploy: "wrangler deploy --minify",
			"cf-typegen": "wrangler types --env-interface CloudflareBindings",
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
};
export default config;
