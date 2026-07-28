import { logRaw } from "@cloudflare/cli-shared-helpers";
import { runFrameworkGenerator } from "frameworks/index";
import { detectPackageManager } from "helpers/packageManagers";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	// Experimental path uses the same vinext greenfield scaffolder as the
	// stable template. create-vinext-app is already Workers-ready by default.
	const pmFlag =
		npm === "pnpm"
			? "--use-pnpm"
			: npm === "yarn"
				? "--use-yarn"
				: npm === "bun"
					? "--use-bun"
					: "--use-npm";

	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--platform",
		"cloudflare",
		// Avoid a placeholder KV namespace id that would block `wrangler deploy`
		// until the user manually provisions one. Caching can be added later
		// via vinext's Cloudflare cache adapters.
		"--data-cache",
		"none",
		"--yes",
		"--skip-install",
		"--disable-git",
		pmFlag,
	]);

	logRaw("");
};

const envInterfaceName = "CloudflareEnv";
const typesPath = "./worker-configuration.d.ts";

export default {
	configVersion: 1,
	id: "next",
	frameworkCli: "create-vinext-app",
	platform: "workers",
	displayName: "Next.js",
	generate,
	transformPackageJson: async () => ({
		scripts: {
			"cf-typegen": `wrangler types --env-interface ${envInterfaceName} ${typesPath}`,
		},
	}),
	devScript: "dev",
	previewScript: "start",
	deployScript: "deploy",
	typesPath,
	envInterfaceName,
} as TemplateConfig;
