import { logRaw } from "@cloudflare/cli";
import { runFrameworkGenerator } from "frameworks/index";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		// Note: the vike create CLI supports a `--cloudflare` argument for creating cloudflare-ready
		//       projects, that works great but here we don't want to use that because we do want to
		//       exercise the general autoconfig/`wrangler setup` functionality (which amongst other
		//       things lets up ensure that we can support the migration of existing vike projects)
		"--no-git",
	]);

	logRaw(""); // newline
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "vike",
	platform: "workers",
	frameworkCli: "create-vike",
	displayName: "Vike",
	generate,
	devScript: "dev",
	deployScript: "deploy",
	previewScript: "preview",
};
export default config;
