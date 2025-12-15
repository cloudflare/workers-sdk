import { downloadRemoteTemplate, updatePackageName } from "../../src/templates";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const generate = async (ctx: C3Context) => {
	const repoUrl =
		"https://github.com/opennextjs/opennextjs-cloudflare/tree/main/create-cloudflare/next";

	await downloadRemoteTemplate(repoUrl, {
		intoFolder: ctx.project.path,
	});

	await updatePackageName(ctx);
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
