import { logRaw } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { runFrameworkGenerator } from "frameworks/index";
import { detectPackageManager } from "helpers/packageManagers";
import { installPackages } from "helpers/packages";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [
		"--project-name",
		ctx.project.name,
		"--template",
		"07_cloudflare",
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
	id: "waku",
	frameworkCli: "create-waku",
	platform: "workers",
	displayName: "Waku",
	copyFiles: {
		path: "./templates",
	},
	path: "templates-experimental/waku",
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `${npm} run build && wrangler deploy`,
			preview: `${npm} run build && wrangler dev`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
