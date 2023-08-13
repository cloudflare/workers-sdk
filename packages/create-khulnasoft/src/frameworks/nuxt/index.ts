import { logRaw } from "helpers/cli";
import { npmInstall, runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { writeFile } from "helpers/files";
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
	writeFile("./.node-version", "17");
	await npmInstall();
};

const config: FrameworkConfig = {
	generate,
	configure,
	displayName: "Nuxt",
	packageScripts: {
<<<<<<< HEAD:packages/create-cloudflare/src/frameworks/nuxt/index.ts
		"pages:dev": `triangle pages dev ${compatDateFlag()} --proxy 3000 -- npm run dev`,
		"pages:deploy": `NODE_VERSION=17 npm run generate && triangle pages publish ./dist`,
=======
		build: (cmd) => `NITRO_PRESET=cloudflare-pages ${cmd}`,
		"pages:dev": `wrangler pages dev ${compatDateFlag()} --proxy 3000 -- npm run dev`,
		"pages:deploy": "npm run build && wrangler pages deploy ./dist",
>>>>>>> da9ba3c855317c6071eb892def4965706f2fb97f:packages/create-khulnasoft/src/frameworks/nuxt/index.ts
	},
};
export default config;
