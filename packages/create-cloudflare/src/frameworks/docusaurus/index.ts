import { detectPackageManager, runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { getFrameworkVersion } from "../index";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const version = getFrameworkVersion(ctx);

	await runFrameworkGenerator(
		ctx,
		`${npm} create docusaurus@${version} ${ctx.project.name} classic`
	);
};

const config: FrameworkConfig = {
	generate,
	displayName: "Docusaurus",
	packageScripts: {
		"pages:dev": `wrangler pages dev ${compatDateFlag()} --proxy 3000 -- ${npm} run start`,
		"pages:deploy": `NODE_VERSION=16 ${npm} run build && wrangler pages publish ./build`,
	},
};
export default config;
