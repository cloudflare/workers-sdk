import { brandColor, dim } from "@cloudflare/cli/colors";
import { runFrameworkGenerator } from "frameworks/index";
import { installPackages } from "helpers/packages";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--ts",
		"--tailwind",
		"--eslint",
		"--app",
		"--import-alias",
		"@/*",
		"--src-dir",
	]);
};

const configure = async () => {
	const packages = [
		"@opennextjs/cloudflare@0.3.x",
		"@cloudflare/workers-types",
	];
	await installPackages(packages, {
		dev: true,
		startText: "Adding the Cloudflare adapter",
		doneText: `${brandColor(`installed`)} ${dim(packages.join(", "))}`,
	});
};

export default {
	configVersion: 1,
	id: "next",
	frameworkCli: "create-next-app",
	// TODO: here we need to specify a version of create-next-app which is different from the
	//       standard one used in the stable Next.js template, that's because our open-next adapter
	//       is not yet fully ready for Next.js 15, once it is we should remove the following
	frameworkCliPinnedVersion: "14.2.5",
	platform: "workers",
	displayName: "Next (using Node.js compat + Workers Assets)",
	path: "templates-experimental/next",
	copyFiles: {
		path: "./templates",
	},
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `opennextjs-cloudflare && wrangler deploy`,
			preview: `opennextjs-cloudflare && wrangler dev`,
			"cf-typegen": `wrangler types --env-interface CloudflareEnv env.d.ts`,
		},
	}),
	devScript: "dev",
	previewScript: "preview",
	deployScript: "deploy",
	compatibilityFlags: ["nodejs_compat"],
} as TemplateConfig;
