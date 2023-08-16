import { runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import { getFrameworkCli } from "../index";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npm, dlx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const cli = getFrameworkCli(ctx);
	await runFrameworkGenerator(ctx, `${dlx} ${cli} ${ctx.project.name}`);
};

const config: FrameworkConfig = {
	generate,
	displayName: "Vue",
	packageScripts: {
		"pages:dev": `wrangler pages dev ${compatDateFlag()} --proxy 5173 -- ${npm} run dev`,
		"pages:deploy": `${npm} run build && wrangler pages deploy ./dist`,
	},
	testFlags: ["--ts"],
};
export default config;
