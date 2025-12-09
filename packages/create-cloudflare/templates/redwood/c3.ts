import { logRaw } from "@cloudflare/cli";
import { runFrameworkGenerator } from "frameworks/index";
import { detectPackageManager } from "helpers/packageManagers";
import { installPackages } from "helpers/packages";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [ctx.project.name]);

	// Note: for redwood projects we need to force install the latest version of wrangler
	//       if we don't do the CI npm e2e fails to install the app's dependencies
	//       (we couldn't reproduce this locally, but it can possibly happen to users as well?)
	await installPackages([`wrangler@latest`], {
		dev: true,
		force: true,
	});

	logRaw("");
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "redwood",
	platform: "workers",
	frameworkCli: "create-rwsdk",
	displayName: "RedwoodSDK",
	generate,
	transformPackageJson: async () => ({
		scripts: {
			deploy: `${npm} run release`,
			preview: `${npm} run build && wrangler dev`,
			"cf-typegen": `wrangler types`,
		},
	}),
	devScript: "dev",
	deployScript: "release",
	previewScript: "preview",
};
export default config;
