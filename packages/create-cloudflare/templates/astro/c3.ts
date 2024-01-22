import { logRaw } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { npmInstall, runCommand, runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import type { FrameworkConfig, C3Context } from "types";

const { npx } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [ctx.project.name, "--no-install"]);

	logRaw(""); // newline
};

const configure = async (ctx: C3Context) => {
	// Navigate to the directory and add the adapter
	process.chdir(ctx.project.path);

	// Need to ensure install first so `astro` works
	await npmInstall();

	await runCommand([npx, "astro", "add", "cloudflare", "-y"], {
		silent: true,
		startText: "Installing adapter",
		doneText: `${brandColor("installed")} ${dim(
			`via \`${npx} astro add cloudflare\``
		)}`,
	});
};

const config: FrameworkConfig = {
	id: "astro",
	platform: "pages",
	displayName: "Astro",
	generate,
	configure,
	getPackageScripts: async () => ({
		"pages:dev": `wrangler pages dev ${await compatDateFlag()} -- astro dev`,
		"pages:deploy": `astro build && wrangler pages deploy ./dist`,
	}),
	testFlags: [
		"--skip-houston",
		"--no-install",
		"--no-git",
		"--template",
		"blog",
		"--typescript",
		"strict",
	],
};
export default config;
