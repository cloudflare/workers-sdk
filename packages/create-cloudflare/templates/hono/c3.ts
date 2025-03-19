import { logRaw } from "@cloudflare/cli";
import { runFrameworkGenerator } from "frameworks/index";
import { processArgument } from "helpers/args";
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
		async selectVariant(ctx: C3Context) {
			return processArgument(ctx.args, "template", {
				type: "select",
				question: "Do you want to include assets?",
				label: "Include assets",
				options: [
					{
						value: "hono-worker-assets",
						label: "Yes",
					},
					{
						value: "hono-worker-only",
						label: "No",
					},
				],
				defaultValue: "hono-worker-assets",
			});
		},
		variants: {
			"hono-worker-assets": {
				path: "./worker-with-assets",
			},
			"hono-worker-only": {
				path: "./worker-only",
			},
		},
	},
	platform: "workers",
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
	previewScript: "dev",
};
export default config;
