import { logRaw } from "@cloudflare/cli";
import { runFrameworkGenerator } from "helpers/command";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--template",
		"cloudflare-workers",
	]);

	logRaw(""); // newline
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "hono",
	displayName: "Hono",
	platform: "workers",
	generate,
	devScript: "dev",
	deployScript: "deploy",
};
export default config;
