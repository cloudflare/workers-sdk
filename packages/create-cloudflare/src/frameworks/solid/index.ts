import { logRaw, updateStatus } from "helpers/cli";
import { blue, brandColor, dim } from "helpers/colors";
import { installPackages, runFrameworkGenerator } from "helpers/command";
import { compatDateFlag, usesTypescript, writeFile } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import { getFrameworkCli } from "../index";
import { viteConfig } from "./templates";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npm, dlx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	// Run the create-solid command
	const cli = getFrameworkCli(ctx);
	await runFrameworkGenerator(ctx, `${dlx} ${cli} ${ctx.project.name}`);

	logRaw("");
};

const configure = async (ctx: PagesGeneratorContext) => {
	process.chdir(ctx.project.path);

	// Install the pages adapter
	const pkg = "solid-start-cloudflare-pages";
	await installPackages([pkg], {
		dev: true,
		startText: "Adding the Cloudflare Pages adapter",
		doneText: `${brandColor(`installed`)} ${dim(pkg)}`,
	});

	// modify the vite config
	const viteConfigPath = usesTypescript()
		? `./vite.config.ts`
		: `./vite.config.js`;
	writeFile(viteConfigPath, viteConfig);
	updateStatus(
		`Adding the Cloudflare Pages adapter to ${blue(viteConfigPath)}`
	);
};

const config: FrameworkConfig = {
	generate,
	configure,
	displayName: "Solid",
	packageScripts: {
		"pages:dev": `wrangler pages dev ${compatDateFlag()} --proxy 3000 -- ${npm} run dev`,
		"pages:deploy": `${npm} run build && wrangler pages deploy ./dist/public`,
	},
};
export default config;
