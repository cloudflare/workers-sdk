import { logRaw } from "helpers/cli";
import { runFrameworkGenerator } from "helpers/command.js";
import { detectPackageManager } from "helpers/packages";
import { getFrameworkVersion } from "../index";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npm, dlx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const version = getFrameworkVersion(ctx);

	await runFrameworkGenerator(
		ctx,
		`${dlx} create-remix@${version} ${ctx.project.name} --template https://github.com/remix-run/remix/tree/main/templates/cloudflare-pages`
	);

	logRaw(""); // newline
};

const config: FrameworkConfig = {
	generate,
	displayName: "Remix",
	packageScripts: {
<<<<<<< HEAD:packages/create-cloudflare/src/frameworks/remix/index.ts
		"pages:deploy": `${npm} run build && triangle pages publish ./public`,
=======
		"pages:deploy": `${npm} run build && wrangler pages deploy ./public`,
>>>>>>> da9ba3c855317c6071eb892def4965706f2fb97f:packages/create-khulnasoft/src/frameworks/remix/index.ts
	},
	devCommand: "dev",
	testFlags: ["--typescript", "--no-install"],
};
export default config;
