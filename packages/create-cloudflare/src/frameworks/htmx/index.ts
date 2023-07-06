import { logRaw } from "helpers/cli";
import {
	detectPackageManager,
	runFrameworkGenerator,
	runCommand,
} from "helpers/command.js";
import { compatDateFlag } from "helpers/files";
import { getFrameworkVersion } from "../index";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npm, npx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const version = getFrameworkVersion(ctx);
	await runFrameworkGenerator(
		ctx,
		`${npx} cloudflare-htmx@${version} ${ctx.project.name}`
	);

	logRaw(""); // newline
};

const configure = async (ctx: PagesGeneratorContext) => {
	process.chdir(ctx.project.path);
	await runCommand(`${npm} i cloudflare-htmx@latest`, {
		silent: true,
	});
};

const config: FrameworkConfig = {
	generate,
	configure,
	displayName: "HTMX",
	packageScripts: {
		deploy: "wrangler pages deploy ./static",
		dev: `wrangler pages dev ./static ${compatDateFlag()}`,
	},
	deployCommand: "deploy",
	devCommand: "dev",
};
export default config;
