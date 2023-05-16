import { logRaw } from "helpers/cli";
import { brandColor, dim } from "helpers/colors";
import {
	detectPackageManager,
	npmInstall,
	runCommand,
	runFrameworkGenerator,
} from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { getFrameworkVersion } from "../index";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const version = getFrameworkVersion(ctx);

	await runFrameworkGenerator(
		ctx,
		`${npx} create-astro@${version} ${ctx.project.name} --no-install`
	);

	logRaw(""); // newline
};

const configure = async (ctx: PagesGeneratorContext) => {
	// Navigate to the directory and add the adapter
	process.chdir(ctx.project.path);

	// Need to ensure install first so `astro` works
	await npmInstall();

	await runCommand(`${npx} astro add cloudflare -y`, {
		silent: true,
		startText: "Installing adapter",
		doneText: `${brandColor("installed")} ${dim(
			`via \`${npx} astro add cloudflare\``
		)}`,
	});
};

const config: FrameworkConfig = {
	generate,
	configure,
	displayName: "Astro",
	packageScripts: {
		"pages:dev": `wrangler pages dev ${compatDateFlag()} --proxy 3000 -- astro dev`,
		"pages:deploy": `astro build && wrangler pages publish ./dist`,
	},
	testFlags: [
		"--skip-houston",
		"--yes",
		"--no-install",
		"--no-git",
		"--template",
		"blog",
		"--typescript",
		"strict",
	],
};
export default config;
