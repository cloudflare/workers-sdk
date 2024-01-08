import { runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	await runFrameworkGenerator(ctx, [ctx.project.name, "classic"]);
};

const config: FrameworkConfig = {
	generate,
	displayName: "Docusaurus",
	getPackageScripts: async () => ({
		"pages:dev": `wrangler pages dev ${await compatDateFlag()} --proxy 3000 -- ${npm} run start`,
		"pages:deploy": `${npm} run build && wrangler pages deploy ./build`,
	}),
	testFlags: [`--package-manager`, npm],
};
export default config;
