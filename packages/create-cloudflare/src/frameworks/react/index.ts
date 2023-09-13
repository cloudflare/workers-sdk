import { logRaw } from "helpers/cli";
import { resetPackageManager, runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import { getFrameworkCli } from "../index";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npm, dlx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const cli = getFrameworkCli(ctx);

	await runFrameworkGenerator(ctx, `${dlx} ${cli} ${ctx.project.name}`);

	logRaw("");
};

const configure = async (ctx: PagesGeneratorContext) => {
	await resetPackageManager(ctx);
};

const config: FrameworkConfig = {
	generate,
	configure,
	displayName: "React",
	packageScripts: {
		"pages:dev": `wrangler pages dev ${compatDateFlag()} --port 3000 -- ${npm} start`,
		"pages:deploy": `${npm} run build && wrangler pages deploy ./build`,
	},
};
export default config;
