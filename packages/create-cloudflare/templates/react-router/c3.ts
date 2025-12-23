import { logRaw } from "@cloudflare/cli";
import { runFrameworkGenerator } from "frameworks/index";
import { detectPackageManager } from "helpers/packageManagers";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		...(ctx.args.experimental
			? []
			: [
					"--template",
					// React-router deleted the template here
					"https://github.com/remix-run/react-router-templates/tree/29ac272b9532fe26463a2d2693fc73ff3c1e884b/cloudflare",
				]),
		// to prevent asking about git twice, just let c3 do it
		"--no-git-init",
		"--no-install",
	]);

	logRaw(""); // newline
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "react-router",
	platform: "workers",
	frameworkCli: "create-react-router",
	displayName: "React Router (formerly Remix)",
	copyFiles: {
		path: "./ts",
	},
	generate,
	transformPackageJson: async () => ({
		dependencies: {
			"react-router": "^7.10.0",
		},
		devDependencies: {
			"@react-router/dev": "^7.10.0",
		},
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
