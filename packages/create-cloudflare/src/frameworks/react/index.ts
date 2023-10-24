import { logRaw } from "@cloudflare/cli";
import { resetPackageManager, runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import { getFrameworkCli } from "../index";
import type { FrameworkConfig, PagesGeneratorContext } from "types";

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
	getPackageScripts: async () => ({
		"pages:dev": `wrangler pages dev ${await compatDateFlag()} --port 3000 -- ${npm} start`,
		"pages:deploy": `${npm} run build && wrangler pages deploy ./build`,
	}),
};
export default config;
