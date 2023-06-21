import { logRaw } from "helpers/cli";
import { npmInstall, runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import { getFrameworkVersion } from "..";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { dlx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const version = getFrameworkVersion(ctx);

	await runFrameworkGenerator(
		ctx,
		`${dlx} nuxi@${version} init ${ctx.project.name}`
	);

	logRaw(""); // newline
};

const configure = async (ctx: PagesGeneratorContext) => {
	process.chdir(ctx.project.path);
	await npmInstall();
};

const config: FrameworkConfig = {
	generate,
	configure,
	displayName: "Nuxt",
	packageScripts: {
		"pages:dev": `wrangler pages dev ${compatDateFlag()} --proxy 3000 -- npm run dev`,
		"pages:deploy": `NODE_VERSION=17 npm run generate && wrangler pages deploy ./dist`,
	},
};
export default config;
