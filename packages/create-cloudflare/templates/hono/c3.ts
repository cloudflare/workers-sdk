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
	configVersion: 1,
	id: "hono",
	displayName: "Hono",
	// TODO: make this work
	// platform: 'workers',
	platform: "pages",
	generate,
	devCommand: ["dev"],
	deployCommand: ["deploy"],
	type: "workers",
};
export default config;
