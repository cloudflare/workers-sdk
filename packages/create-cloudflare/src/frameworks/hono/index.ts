import { logRaw } from "helpers/cli";
import { runFrameworkGenerator } from "helpers/command";
import { detectPackageManager } from "helpers/packages";
import { getFrameworkVersion } from "../index";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const version = getFrameworkVersion(ctx);

	await runFrameworkGenerator(
		ctx,
		`${npm} create hono@${version} ${ctx.project.name} --template cloudflare-pages`
	);

	logRaw(""); // newline
};

const config: FrameworkConfig = {
	generate,
	displayName: "Hono",
	packageScripts: {},
	deployCommand: "deploy",
	devCommand: "dev",
};
export default config;
