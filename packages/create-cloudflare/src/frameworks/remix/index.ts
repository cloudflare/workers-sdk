import { logRaw } from "helpers/cli";
import {
	detectPackageManager,
	runFrameworkGenerator,
} from "helpers/command.js";
import { getFrameworkVersion } from "../index";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npm, npx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const version = getFrameworkVersion(ctx);

	await runFrameworkGenerator(
		ctx,
		`${npx} create-remix@${version} ${ctx.project.name} --template cloudflare-pages`
	);

	logRaw(""); // newline
};

const config: FrameworkConfig = {
	generate,
	displayName: "Remix",
	packageScripts: {
		"pages:deploy": `${npm} run build && wrangler pages publish ./public`,
	},
	devCommand: "dev",
	testFlags: ["--typescript", "--no-install"],
};
export default config;
