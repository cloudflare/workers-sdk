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
		ctx.project.name,
		"--template",
		"https://github.com/remix-run/react-router-templates/tree/main/cloudflare",
	]);

	logRaw(""); // newline
};

// TODO: Uncomment this once @react-router/dev updates its peer dependency to Wrangler v4
// const configure = async () => {
// 	await installPackages(["wrangler@latest"], {
// 		dev: true,
// 		startText: "Updating the Wrangler version",
// 		doneText: `${brandColor(`updated`)} ${dim("wrangler@latest")}`,
// 	});
// };

const config: TemplateConfig = {
	configVersion: 1,
	id: "react-router",
	platform: "workers",
	frameworkCli: "create-react-router",
	displayName: "React Router (formerly Remix)",
	copyFiles: {
		path: "./templates",
	},
	generate,
	// configure,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `${npm} run build && wrangler deploy`,
			preview: `${npm} run build && vite preview`,
			"cf-typegen": `wrangler types`,
		},
	}),
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
