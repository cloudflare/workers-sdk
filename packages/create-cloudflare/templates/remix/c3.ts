import { logRaw } from "@cloudflare/cli";
import { runFrameworkGenerator } from "helpers/command.js";
import { detectPackageManager } from "helpers/packages";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--template",
		"https://github.com/remix-run/remix/tree/main/templates/cloudflare-pages",
	]);

	logRaw(""); // newline
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "remix",
	displayName: "Remix",
	platform: "pages",
	generate,
	transformPackageJson: async () => ({
		scripts: {
			"pages:deploy": `${npm} run build && wrangler pages deploy ./public`,
		},
	}),
	devScript: "dev",
	testFlags: ["--typescript", "--no-install", "--no-git-init"],
};
export default config;
