import { inputPrompt } from "@cloudflare/cli-shared-helpers/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { detectPackageManager } from "helpers/packageManagers";
import type { TemplateConfig } from "../../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	const defaultTemplate = "https://github.com/gatsbyjs/gatsby-starter-blog";

	const useTemplate = await inputPrompt({
		type: "confirm",
		message: "Would you like to use a template?",
		initialValue: true,
	});

	let templateUrl = "";
	if (useTemplate) {
		templateUrl = await inputPrompt({
			type: "text",
			message: `Please specify the url of the template you'd like to use`,
			defaultValue: defaultTemplate,
		});
	}

	await runFrameworkGenerator(ctx, ["new", ctx.project.name, templateUrl]);
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "gatsby",
	frameworkCli: "gatsby",
	platform: "pages",
	hidden: true,
	displayName: "Gatsby",
	path: "templates/gatsby/pages",
	generate,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `${npm} run build && wrangler pages deploy ./public`,
			preview: `${npm} run build && wrangler pages dev ./public`,
		},
	}),
	devScript: "develop",
	deployScript: "deploy",
	previewScript: "preview",
	workersTypes: "none",
};
export default config;
