import { brandColor, dim } from "@cloudflare/cli/colors";
import { runFrameworkGenerator } from "frameworks/index";
import { runCommand } from "helpers/command";
import { detectPackageManager } from "helpers/packageManagers";
import { installPackages } from "helpers/packages";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

// Script used to generate the cloudflare types.
const NPM_TYPE_GEN_SCRIPT = "cf-typegen";

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

const configure = async (ctx: C3Context) => {
	const packages = [
		"@opennextjs/cloudflare@0.3.x",
		"@cloudflare/workers-types",
	];
	await installPackages(packages, {
		dev: true,
		startText: "Adding the Cloudflare adapter",
		doneText: `${brandColor(`installed`)} ${dim(packages.join(", "))}`,
	});

	const { npm } = detectPackageManager();
	await runCommand([npm, "run", NPM_TYPE_GEN_SCRIPT], {
		cwd: ctx.project.path,
		silent: true,
		startText: "Generating the types",
		doneText: `${brandColor(`added`)} ${dim("cloudflare-env.d.ts")}`,
	});
};

export default {
	configVersion: 1,
	id: "next",
	frameworkCli: "create-next-app",
	// TODO: here we need to specify a version of create-next-app which is different from the
	//       standard one used in the stable Next.js template, that's because our open-next adapter
	//       is not yet fully ready for Next.js 15, once it is we should remove the following
	frameworkCliPinnedVersion: "^14.2.23",
	platform: "workers",
	displayName: "Next.js (using Node.js compat + Workers Assets)",
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
			[NPM_TYPE_GEN_SCRIPT]: `wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts`,
		},
	}),
	devScript: "dev",
	previewScript: "preview",
	deployScript: "deploy",
	compatibilityFlags: ["nodejs_compat"],
} as TemplateConfig;
