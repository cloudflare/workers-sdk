import { logRaw } from "@cloudflare/cli";
import { runFrameworkGenerator } from "helpers/command";
import type { FrameworkConfig, C3Context } from "types";

const generate = async (ctx: C3Context) => {
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
	devCommand: ["dev"],
	deployCommand: ["deploy"],
	type: "workers",
};
export default config;
