import { logRaw } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { transformFile } from "helpers/codemod";
import { detectPackageManager } from "helpers/packageManagers";
import { installPackages } from "helpers/packages";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--template",
		"https://github.com/remix-run/remix/tree/main/templates/cloudflare-workers",
	]);

	logRaw(""); // newline
};

const configure = async () => {
	await installPackages(["wrangler@latest"], {
		dev: true,
		startText: "Updating the Wrangler version",
		doneText: `${brandColor(`updated`)} ${dim("wrangler@latest")}`,
	});
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "remix",
	frameworkCli: "create-remix",
	platform: "workers",
	displayName: "Remix",
	copyFiles: {
		path: "./templates",
	},
	path: "templates-experimental/remix",
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			preview: `${npm} run build && wrangler dev`,
			"cf-typegen": `wrangler types`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
