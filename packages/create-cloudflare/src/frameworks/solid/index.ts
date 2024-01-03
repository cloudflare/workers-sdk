import { logRaw } from "@cloudflare/cli";
import { runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import type { FrameworkConfig, PagesGeneratorContext } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	// Run the create-solid command
	await runFrameworkGenerator(ctx, [ctx.project.name]);

	logRaw("");
};

const configure = async (ctx: PagesGeneratorContext) => {
	process.chdir(ctx.project.path);

	// Note: we should update the vite.config.ts/js file here and set the preset on
	// start.server.preset (as described in the solidStart docs: https://start.solidjs.com/api/vite#configuring-your-application)
	// but that doesn't seem to work, so for now we just set the PRESET env variable in the build script
	// later we should amend this when it's properly handled on solidStart's side
};

const config: FrameworkConfig = {
	generate,
	configure,
	displayName: "Solid",
	getPackageScripts: async () => ({
		build: (cmd) => `PRESET=cloudflare-pages ${cmd}`,
		"pages:dev": `wrangler pages dev ${await compatDateFlag()} --proxy 3000 -- ${npm} run dev`,
		"pages:deploy": `${npm} run build && wrangler pages deploy ./dist`,
	}),
};
export default config;
