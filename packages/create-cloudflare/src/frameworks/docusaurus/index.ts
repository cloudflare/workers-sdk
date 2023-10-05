import { runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import { getFrameworkCli } from "../index";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npm, dlx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const cli = getFrameworkCli(ctx);

	await runFrameworkGenerator(ctx, `${dlx} ${cli} ${ctx.project.name} classic`);
};

const config: FrameworkConfig = {
	generate,
	displayName: "Docusaurus",
	packageScripts: {
		"pages:dev": `wrangler pages dev ${compatDateFlag()} --proxy 3000 -- ${npm} run start`,
		"pages:deploy": `NODE_VERSION=16 ${npm} run build && wrangler pages deploy ./build`,
	},
	testFlags: [`--package-manager`, npm],
};
export default config;
