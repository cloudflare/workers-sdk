import { logRaw } from "@cloudflare/cli";
import { runFrameworkGenerator } from "helpers/command";
import type { FrameworkConfig, PagesGeneratorContext } from "types";

const generate = async (ctx: PagesGeneratorContext) => {
	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--template",
		"cloudflare-workers",
	]);

	logRaw(""); // newline
};

const config: FrameworkConfig = {
	generate,
	displayName: "Hono",
	getPackageScripts: async () => ({}),
	deployCommand: "deploy",
	devCommand: "dev",
	type: "workers",
};
export default config;
