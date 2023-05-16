import { logRaw } from "helpers/cli";
import { detectPackageManager, runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { getFrameworkVersion } from "../index";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npm, npx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const version = getFrameworkVersion(ctx);

	await runFrameworkGenerator(
		ctx,
		`${npx} create-react-app@${version} ${ctx.project.name}`
	);

	logRaw("");
};

const config: FrameworkConfig = {
	generate,
	displayName: "React",
	packageScripts: {
		"pages:dev": `wrangler pages dev ${compatDateFlag()} --port 3000 -- ${npm} start`,
		"pages:deploy": `${npm} run build && wrangler pages publish ./build`,
	},
};
export default config;
