import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { logRaw } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { npmInstall, runFrameworkGenerator } from "helpers/command";
import { compatDateFlag, writeFile } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import type { FrameworkConfig, PagesGeneratorContext } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const gitFlag = ctx.args.git ? `--gitInit` : `--no-gitInit`;

	await runFrameworkGenerator(ctx, [
		"init",
		ctx.project.name,
		"--packageManager",
		npm,
		gitFlag,
	]);

	logRaw(""); // newline
};

const configure = async (ctx: PagesGeneratorContext) => {
	process.chdir(ctx.project.path);
	writeFile("./.node-version", "17");
	await updateNuxtConfig();
	await npmInstall();
};

const config: FrameworkConfig = {
	generate,
	configure,
	displayName: "Nuxt",
	getPackageScripts: async () => ({
		"pages:dev": `wrangler pages dev ${await compatDateFlag()} --proxy 3000 -- ${npm} run dev`,
		"pages:deploy": `${npm} run build && wrangler pages deploy ./dist`,
	}),
};
export default config;

function updateNuxtConfig() {
	const configFileName = "nuxt.config.ts";
	const configFilePath = resolve(configFileName);
	const s = spinner();
	s.start(`Updating \`${configFileName}\``);
	// Add the cloudflare preset into the configuration file.
	const originalConfigFile = readFileSync(configFilePath, "utf8");
	const updatedConfigFile = originalConfigFile.replace(
		"defineNuxtConfig({",
		"defineNuxtConfig({\n  nitro: {\n    preset: 'cloudflare-pages'\n  },"
	);
	writeFile(configFilePath, updatedConfigFile);
	s.stop(`${brandColor(`updated`)} ${dim(`\`${configFileName}\``)}`);
}
