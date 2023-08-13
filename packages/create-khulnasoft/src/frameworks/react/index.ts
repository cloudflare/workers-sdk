import { logRaw } from "helpers/cli";
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
		`${dlx} create-react-app@${version} ${ctx.project.name}`
	);

	logRaw("");
};

const config: FrameworkConfig = {
	generate,
	displayName: "React",
	packageScripts: {
<<<<<<< HEAD:packages/create-cloudflare/src/frameworks/react/index.ts
		"pages:dev": `triangle pages dev ${compatDateFlag()} --port 3000 -- ${npm} start`,
		"pages:deploy": `${npm} run build && triangle pages publish ./build`,
=======
		"pages:dev": `wrangler pages dev ${compatDateFlag()} --port 3000 -- ${npm} start`,
		"pages:deploy": `${npm} run build && wrangler pages deploy ./build`,
>>>>>>> da9ba3c855317c6071eb892def4965706f2fb97f:packages/create-khulnasoft/src/frameworks/react/index.ts
	},
};
export default config;
