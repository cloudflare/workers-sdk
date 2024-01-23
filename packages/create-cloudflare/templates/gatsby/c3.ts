import { inputPrompt } from "@cloudflare/cli/interactive";
import { runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import type { TemplateConfig } from "../../src/templates";
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
	platform: "pages",
	displayName: "Gatsby",
	generate,
	transformPackageJson: async () => ({
		scripts: {
			"pages:dev": `wrangler pages dev ${await compatDateFlag()} --proxy 8000 -- ${npm} run develop`,
			"pages:deploy": `${npm} run build && wrangler pages deploy ./public`,
		},
	}),
};
export default config;
