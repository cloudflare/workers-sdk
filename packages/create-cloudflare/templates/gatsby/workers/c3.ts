import { inputPrompt } from "@cloudflare/cli/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { detectPackageManager } from "helpers/packageManagers";
import type { TemplateConfig } from "../../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	const defaultTemplate = "https://github.com/gatsbyjs/gatsby-starter-blog";

	const useTemplate = await inputPrompt({
		type: "confirm",
		question: "Would you like to use a template?",
		label: "template",
		defaultValue: true,
	});

	let templateUrl = "";
	if (useTemplate) {
		templateUrl = await inputPrompt({
			type: "text",
			question: `Please specify the url of the template you'd like to use`,
			label: "template",
			defaultValue: defaultTemplate,
		});
	}

	await runFrameworkGenerator(ctx, ["new", ctx.project.name, templateUrl]);
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "gatsby",
	frameworkCli: "gatsby",
	platform: "workers",
	displayName: "Gatsby",
	copyFiles: {
		path: "./templates",
	},
	path: "templates/gatsby/workers",
	generate,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `${npm} run build && wrangler deploy`,
			preview: `${npm} run build && wrangler dev`,
		},
	}),
	devScript: "develop",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
