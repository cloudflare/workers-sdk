import type { C3Context } from "types";

import { runFrameworkGenerator } from "frameworks/index";
import { detectPackageManager } from "helpers/packageManagers";

import { logRaw } from "@cloudflare/cli";

import type { TemplateConfig } from "../../../src/templates";

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

const envInterfaceName = "CloudflareBindings";
const config: TemplateConfig = {
	configVersion: 1,
	id: "hono",
	frameworkCli: "create-hono",
	displayName: "Hono",
	copyFiles: {
		path: "./templates",
	},
	platform: "workers",
	path: "templates/hono/workers",
	generate,
	transformPackageJson: async () => ({
		scripts: {
			"cf-typegen": `wrangler types --env-interface ${envInterfaceName}`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "dev",
	envInterfaceName,
};
export default config;
