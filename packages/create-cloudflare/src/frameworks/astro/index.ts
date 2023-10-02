import { logRaw } from "helpers/cli";
import { brandColor, dim } from "helpers/colors";
import { npmInstall, runCommand, runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import { getFrameworkCli } from "../index";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npx, dlx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const cli = getFrameworkCli(ctx);

	await runFrameworkGenerator(
		ctx,
		`${dlx} ${cli} ${ctx.project.name} --no-install`
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
		"pages:deploy": `astro build && wrangler pages deploy ./dist`,
	},
	testFlags: [
		"--skip-houston",
		"--yes",
		"--no-install",
		"--no-git",
		"--template",
		"basics",
		"--typescript",
		"strict",
	],
};
export default config;
