import { logRaw } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { runFrameworkGenerator } from "frameworks/index";
import { runCommand } from "helpers/command";
import { usesTypescript } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import type { TemplateConfig } from "../../../src/templates";
import type { C3Context, PackageJson } from "types";

const { npx } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	// `--add cloudflare` could be used here because it invokes `astro` which is not installed (`--no-install`)
	// The adapter is added in the `configure` step instead
	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		// c3 will later install the dependencies
		"--no-install",
		// c3 will later ask users if they want to use git
		"--no-git",
	]);

	logRaw(""); // newline
};

const configure = async () => {
	await runCommand([npx, "astro", "add", "cloudflare", "-y"], {
		silent: true,
		startText: "Installing adapter",
		doneText: `${brandColor("installed")} ${dim(
			`via \`${npx} astro add cloudflare\``
		)}`,
	});
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "astro",
	frameworkCli: "create-astro",
	platform: "workers",
	displayName: "Astro",
	copyFiles: {
		async selectVariant(ctx) {
			// Note: this `selectVariant` function should not be needed
			//       this is just a quick workaround until
			//       https://github.com/cloudflare/workers-sdk/issues/7495
			//       is resolved
			return usesTypescript(ctx) ? "ts" : "js";
		},
		variants: {
			js: {
				path: "./templates/js",
			},
			ts: {
				path: "./templates/ts",
			},
		},
	},
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
	path: "templates/astro/workers",
	generate,
	configure,
	transformPackageJson: async (pkgJson: PackageJson, ctx: C3Context) => ({
		scripts: {
			deploy: `astro build && wrangler deploy`,
			preview: `astro build && astro preview`,
			...(usesTypescript(ctx) && { "cf-typegen": `wrangler types` }),
		},
	}),
};
export default config;
