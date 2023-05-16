import { endSection } from "helpers/cli";
import {
	detectPackageManager,
	npmInstall,
	runCommand,
	runFrameworkGenerator,
} from "helpers/command";
import { compatDateFlag } from "helpers/files";
import { getFrameworkVersion } from "../index";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npm, npx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const version = getFrameworkVersion(ctx);

	// TODO: make this interactive when its possible to specify the project name
	// to create-qwik in interactive mode
	await runFrameworkGenerator(
		ctx,
		`${npm} create qwik@${version} basic ${ctx.project.name}`
	);
};

const configure = async (ctx: PagesGeneratorContext) => {
	// Run npm install so the `qwik` command in the next step exists
	process.chdir(ctx.project.path);
	await npmInstall();

	// Add the pages integration
	const cmd = `${npx} qwik add cloudflare-pages`;
	endSection(`Running ${cmd}`);
	await runCommand(cmd);
};

const config: FrameworkConfig = {
	generate,
	configure,
	displayName: "Qwik",
	packageScripts: {
		"pages:dev": `wrangler pages dev ${compatDateFlag()} -- ${npm} run dev`,
		"pages:deploy": `${npm} run build && ${npm} run deploy`,
	},
};
export default config;
