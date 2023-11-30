import { logRaw } from "@cloudflare/cli";
import { runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import type { FrameworkConfig, C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [ctx.project.name]);

	logRaw("");
};

const config: FrameworkConfig = {
	generate,
	displayName: "React",
	getPackageScripts: async () => ({
		"pages:dev": `wrangler pages dev ${await compatDateFlag()} --port 3000 -- ${npm} start`,
		"pages:deploy": `${npm} run build && wrangler pages deploy ./build`,
	}),
};
export default config;
