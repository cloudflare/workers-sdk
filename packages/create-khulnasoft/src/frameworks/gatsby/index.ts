import { runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { inputPrompt } from "helpers/interactive";
import { detectPackageManager } from "helpers/packages";
import { getFrameworkVersion } from "../index";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npm, dlx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
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

	const version = getFrameworkVersion(ctx);
	await runFrameworkGenerator(
		ctx,
		`${dlx} gatsby@${version} new ${ctx.project.name} ${templateUrl}`
	);
};

const config: FrameworkConfig = {
	generate,
	displayName: "Gatsby",
	packageScripts: {
		"pages:dev": `wrangler pages dev ${compatDateFlag()} --proxy 8000 -- ${npm} run develop`,
		"pages:deploy": `${npm} run build && wrangler pages deploy ./public`,
	},
};
export default config;
