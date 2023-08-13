import { runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import { getFrameworkVersion } from "../index";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npm, dlx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const version = getFrameworkVersion(ctx);
	await runFrameworkGenerator(
		ctx,
		`${dlx} create-vue@${version} ${ctx.project.name}`
	);
};

const config: FrameworkConfig = {
	generate,
	displayName: "Vue",
	packageScripts: {
<<<<<<< HEAD:packages/create-cloudflare/src/frameworks/vue/index.ts
		"pages:dev": `triangle pages dev ${compatDateFlag()} --proxy 5173 -- ${npm} run dev`,
		"pages:deploy": `${npm} run build && triangle pages publish ./dist`,
=======
		"pages:dev": `wrangler pages dev ${compatDateFlag()} --proxy 5173 -- ${npm} run dev`,
		"pages:deploy": `${npm} run build && wrangler pages deploy ./dist`,
>>>>>>> da9ba3c855317c6071eb892def4965706f2fb97f:packages/create-khulnasoft/src/frameworks/vue/index.ts
	},
	testFlags: ["--ts"],
};
export default config;
