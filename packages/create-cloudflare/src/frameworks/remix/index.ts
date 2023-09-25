import { logRaw } from "helpers/cli";
import { runFrameworkGenerator } from "helpers/command.js";
import { detectPackageManager } from "helpers/packages";
import { getFrameworkCli } from "../index";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npm, dlx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const cli = getFrameworkCli(ctx);

	await runFrameworkGenerator(
		ctx,
		`${dlx} ${cli} ${ctx.project.name} --template https://github.com/remix-run/remix/tree/main/templates/cloudflare-pages`
	);

	logRaw(""); // newline
};

const config: FrameworkConfig = {
	generate,
	displayName: "Remix",
	packageScripts: {
		"pages:deploy": `${npm} run build && wrangler pages deploy ./public`,
	},
	devCommand: "dev",
	testFlags: ["--typescript", "--no-install", "--no-git-init"],
};
export default config;
