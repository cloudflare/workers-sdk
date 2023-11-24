import { logRaw, updateStatus } from "@cloudflare/cli";
import { brandColor, dim, blue } from "@cloudflare/cli/colors";
import { installPackages, runFrameworkGenerator } from "helpers/command";
import { compatDateFlag, usesTypescript, writeFile } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import { viteConfig } from "./templates";
import type { FrameworkConfig, PagesGeneratorContext } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	// Run the create-solid command
	await runFrameworkGenerator(ctx, [ctx.project.name]);

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
	getPackageScripts: async () => ({
		"pages:dev": `wrangler pages dev ${await compatDateFlag()} --proxy 3000 -- ${npm} run dev`,
		"pages:deploy": `${npm} run build && wrangler pages deploy ./dist/public`,
	}),
};
export default config;
