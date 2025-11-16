import { runFrameworkGenerator } from "frameworks/index";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--skip-install",
	]);
};

const envInterfaceName = "CloudflareEnv";
const typesPath = "./cloudflare-env.d.ts";
export default {
	configVersion: 1,
	id: "next",
	frameworkCli: "create-next-app",
	platform: "workers",
	displayName: "Next.js",
	generate,
	devScript: "dev",
	previewScript: "preview",
	deployScript: "deploy",
	typesPath,
	envInterfaceName,
} as TemplateConfig;
