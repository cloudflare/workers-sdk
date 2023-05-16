import { brandColor, dim } from "helpers/colors";
import { detectPackageManager, runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { confirmInput, textInput } from "helpers/interactive";
import { getFrameworkVersion } from "../index";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npm, npx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const defaultTemplate = "https://github.com/gatsbyjs/gatsby-starter-blog";

	const useTemplate = await confirmInput({
		question: "Would you like to use a template?",
		renderSubmitted: (value: boolean) => {
			const status = value ? "yes" : "no";
			return `${brandColor(`template`)} ${status}`;
		},
	});

	let templateUrl = "";
	if (useTemplate) {
		templateUrl = await textInput({
			question: `Please specify the url of the template you'd like to use`,
			renderSubmitted: (value: string) => {
				const result = `Using template \`${value}\``;
				return `${brandColor("template")} ${dim(result)}`;
			},
			defaultValue: defaultTemplate,
		});
	}

	const version = getFrameworkVersion(ctx);
	await runFrameworkGenerator(
		ctx,
		`${npx} gatsby@${version} new ${ctx.project.name} ${templateUrl}`
	);
};

const config: FrameworkConfig = {
	generate,
	displayName: "Gatsby",
	packageScripts: {
		"pages:dev": `wrangler pages dev ${compatDateFlag()} --proxy 8000 -- ${npm} run develop`,
		"pages:deploy": `${npm} run build && wrangler pages publish ./public`,
	},
};
export default config;
