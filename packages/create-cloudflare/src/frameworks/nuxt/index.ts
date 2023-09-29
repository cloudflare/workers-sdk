import { logRaw } from "helpers/cli";
import { npmInstall, runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { writeFile } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import { getFrameworkCli } from "../index";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npm, dlx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const cli = getFrameworkCli(ctx);
	const gitFlag = ctx.args.git ? `--gitInit` : `--no-gitInit`;

	await runFrameworkGenerator(
		ctx,
		`${dlx} ${cli} init ${ctx.project.name} --packageManager ${npm} ${gitFlag}`
	);

	logRaw(""); // newline
};

const configure = async (ctx: PagesGeneratorContext) => {
	process.chdir(ctx.project.path);
	writeFile("./.node-version", "17");
	await npmInstall();
};

const config: FrameworkConfig = {
	generate,
	configure,
	displayName: "Nuxt",
	packageScripts: {
		build: (cmd) => `NITRO_PRESET=cloudflare-pages ${cmd}`,
		"pages:dev": `wrangler pages dev ${compatDateFlag()} --proxy 3000 -- ${npm} run dev`,
		"pages:deploy": `${npm} run build && wrangler pages deploy ./dist`,
	},
};
export default config;
