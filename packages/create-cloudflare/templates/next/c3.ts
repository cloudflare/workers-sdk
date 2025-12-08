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
	copyFiles: {
		path: "./templates",
	},
	generate,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `opennextjs-cloudflare build && opennextjs-cloudflare deploy`,
			preview: `opennextjs-cloudflare build && opennextjs-cloudflare preview`,
			"cf-typegen": `wrangler types --env-interface ${envInterfaceName} ${typesPath}`,
		},
	}),
	devScript: "dev",
	previewScript: "preview",
	deployScript: "deploy",
	typesPath,
	envInterfaceName,
} as TemplateConfig;
