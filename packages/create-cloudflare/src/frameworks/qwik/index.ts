import { endSection } from "@cloudflare/cli";
import { npmInstall, runCommand, runFrameworkGenerator } from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import type { FrameworkConfig, PagesGeneratorContext } from "types";

const { npm, npx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	await runFrameworkGenerator(ctx, ["basic", ctx.project.name]);
};

const configure = async (ctx: PagesGeneratorContext) => {
	// Run npm install so the `qwik` command in the next step exists
	process.chdir(ctx.project.path);
	await npmInstall();

	// Add the pages integration
	const cmd = [npx, "qwik", "add", "cloudflare-pages"];
	endSection(`Running ${cmd.join(" ")}`);
	await runCommand(cmd);
};

const config: FrameworkConfig = {
	generate,
	configure,
	displayName: "Qwik",
	getPackageScripts: async () => ({
		"pages:dev": `wrangler pages dev ${await compatDateFlag()} -- ${npm} run dev`,
		"pages:deploy": `${npm} run build && wrangler pages deploy ./dist`,
	}),
};
export default config;
