import { runFrameworkGenerator } from "frameworks/index";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const generate = async (ctx: C3Context) => {
	// Disable Turbopack as it is not currently compatible with the Cloudflare adapter
	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--no-turbopack",
		"--skip-install",
		// We are using the Cloudflare template for Next.js projects
		// This is a template maintained by Cloudflare that based on a standard Next.js starter project,
		// and has already been configured to work with Cloudflare Workers
		"--example",
		"https://github.com/opennextjs/opennextjs-cloudflare/tree/main/create-cloudflare/next",
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
