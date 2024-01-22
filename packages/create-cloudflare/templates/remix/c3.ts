import { logRaw } from "@cloudflare/cli";
import { runFrameworkGenerator } from "helpers/command.js";
import { detectPackageManager } from "helpers/packages";
import type { FrameworkConfig, C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--template",
		"https://github.com/remix-run/remix/tree/main/templates/cloudflare-pages",
	]);

	logRaw(""); // newline
};

const config: FrameworkConfig = {
	id: "remix",
	displayName: "Remix",
	platform: "pages",
	generate,
	getPackageScripts: async () => ({
		"pages:deploy": `${npm} run build && wrangler pages deploy ./public`,
	}),
	devCommand: ["dev"],
	testFlags: ["--typescript", "--no-install", "--no-git-init"],
};
export default config;
