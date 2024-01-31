import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { logRaw } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { runFrameworkGenerator } from "helpers/command";
import { compatDateFlag, writeFile } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	const gitFlag = ctx.args.git ? `--gitInit` : `--no-gitInit`;

	await runFrameworkGenerator(ctx, [
		"init",
		ctx.project.name,
		"--packageManager",
		npm,
		gitFlag,
	]);

	writeFile("./.node-version", "17");

	logRaw(""); // newline
};

const configure = async () => {
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
};

const config: TemplateConfig = {
	configVersion: 1,
	id: "nuxt",
	platform: "pages",
	displayName: "Nuxt",
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			"pages:dev": `wrangler pages dev ${await compatDateFlag()} --proxy 3000 -- ${npm} run dev`,
			"pages:deploy": `${npm} run build && wrangler pages deploy ./dist`,
		},
	}),
};
export default config;
