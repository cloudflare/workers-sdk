import { logRaw } from "@cloudflare/cli";
import { runFrameworkGenerator } from "helpers/command";
import { detectPackageManager } from "helpers/packages";
import { getFrameworkCli } from "../index";
import type { FrameworkConfig, PagesGeneratorContext } from "types";

const { dlx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const cli = getFrameworkCli(ctx);

	await runFrameworkGenerator(
		ctx,
		`${dlx} ${cli} ${ctx.project.name} --template cloudflare-workers`
	);

	logRaw(""); // newline
};

const config: FrameworkConfig = {
	generate,
	displayName: "Hono",
	getPackageScripts: async () => ({}),
	deployCommand: "deploy",
	devCommand: "dev",
	type: "workers",
};
export default config;
