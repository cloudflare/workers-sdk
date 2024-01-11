import { endSection } from "@cloudflare/cli";
import { npmInstall, runCommand, runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import { quoteShellArgs } from "../../src/common";
import type { C3Context } from "types";
import { TemplateConfig } from "../../src/templateMap";

const { npm, npx } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, ["basic", ctx.project.name]);
};

const configure = async (ctx: C3Context) => {
	// Run npm install so the `qwik` command in the next step exists
	process.chdir(ctx.project.path);
	await npmInstall();

	// Add the pages integration
	const cmd = [npx, "qwik", "add", "cloudflare-pages"];
	endSection(`Running ${quoteShellArgs(cmd)}`);
	await runCommand(cmd);
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "qwik",
	displayName: "Qwik",
	platform: "pages",
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			"pages:dev": `wrangler pages dev ${await compatDateFlag()} -- ${npm} run dev`,
			"pages:deploy": `${npm} run build && wrangler pages deploy ./dist`,
		},
	}),
};
export default config;
