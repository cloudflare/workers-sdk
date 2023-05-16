import { detectPackageManager, runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { getFrameworkVersion } from "../index";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npm, npx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const version = getFrameworkVersion(ctx);
	await runFrameworkGenerator(
		ctx,
		`${npx} create-vue@${version} ${ctx.project.name}`
	);
};

const config: FrameworkConfig = {
	generate,
	displayName: "Vue",
	packageScripts: {
		"pages:dev": `wrangler pages dev ${compatDateFlag()} --proxy 5173 -- ${npm} run dev`,
		"pages:deploy": `${npm} run build && wrangler pages publish ./dist`,
	},
	testFlags: ["--ts"],
};
export default config;
