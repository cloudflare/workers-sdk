import { brandColor } from "@cloudflare/cli/colors";
import { runFrameworkGenerator } from "frameworks/index";
import { installPackages } from "helpers/packages";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		// We are using the Cloudflare template for Next.js projects
		// This is a template maintained by Cloudflare that based on a standard Next.js starter project,
		// and has already been configured to work with Cloudflare Workers
		"--example",
		"https://github.com/cloudflare/templates/tree/main/next-starter-template",
	]);
};

const configure = async () => {
	// Although the template is pre-configured for Cloudflare Workers,
	// we still need to install the latest minor of the OpenNext Cloudflare adapter package.
	await installPackages(["@opennextjs/cloudflare@^1.3.0"], {
		startText: "Adding the Cloudflare adapter",
		doneText: `${brandColor(`installed`)} @opennextjs/cloudflare)}`,
	});
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
	configure,
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
