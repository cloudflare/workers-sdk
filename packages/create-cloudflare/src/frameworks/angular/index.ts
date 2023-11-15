import { cp } from "node:fs/promises";
import { resolve } from "node:path";
import { logRaw } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { installPackages, runFrameworkGenerator } from "helpers/command";
import { compatDateFlag, readFile, readJSON, writeFile } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import type { FrameworkConfig, PagesGeneratorContext } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	await runFrameworkGenerator(ctx, [ctx.project.name, "--ssr"]);

	logRaw("");
};

const configure = async (ctx: PagesGeneratorContext) => {
	process.chdir(ctx.project.path);
	updateAngularJson(ctx);
	await updateAppCode();
	await installCFWorker(ctx);
};

const config: FrameworkConfig = {
	generate,
	configure,
	displayName: "Angular",
	getPackageScripts: async () => ({
		start: `${npm} run pages:build && wrangler pages dev dist/cloudflare ${await compatDateFlag()} --experimental-local`,
		process: "node ./tools/copy-files.mjs && node ./tools/alter-polyfills.mjs",
		"pages:build": `ng build && ${npm} run process`,
		deploy: `${npm} run pages:build && wrangler pages deploy dist/cloudflare`,
	}),
	deployCommand: "deploy",
	devCommand: "start",
	testFlags: ["--style", "sass"],
};
export default config;

async function installCFWorker(ctx: PagesGeneratorContext) {
	const s = spinner();
	s.start(`Adding Cloudflare Pages adapter code`);
	await cp(
		// eslint-disable-next-line no-restricted-globals
		resolve(__dirname, "./angular/templates"),
		resolve(ctx.project.path),
		{ recursive: true, force: true }
	);
	s.stop(`${brandColor("copied")} ${dim("adapter code")}`);

	await installPackages(
		["@cloudflare/workers-types", "@miniflare/tre@next", "wrangler@beta"],
		{
			dev: true,
			startText: "Installing adapter dependencies",
			doneText: `${brandColor("installed")} ${dim(`via \`${npm} install\``)}`,
		}
	);
}
async function updateAppCode() {
	const s = spinner();
	s.start(`Updating application code`);

	// Update an app config file to:
	// - add the `provideHttpClient(withFetch())` call to enable `fetch` usage in `HttpClient`
	const appConfigPath = "src/app/app.config.ts";
	const appConfig = readFile(resolve(appConfigPath));
	const newAppConfig =
		"import { provideHttpClient, withFetch } from '@angular/common/http';\n" +
		appConfig.replace(
			"providers: [",
			"providers: [provideHttpClient(withFetch()), "
		);
	writeFile(resolve(appConfigPath), newAppConfig);
	s.stop(`${brandColor(`updated`)} ${dim(appConfigPath)}`);

	// Remove unwanted dependencies
	s.start(`Updating package.json`);
	const packageJsonPath = resolve("package.json");
	const packageManifest = readJSON(packageJsonPath);

	delete packageManifest["dependencies"]["@angular/ssr"];
	delete packageManifest["dependencies"]["express"];

	writeFile(packageJsonPath, JSON.stringify(packageManifest, null, 2));
	s.stop(`${brandColor(`updated`)} ${dim(`\`package.json\``)}`);
}

function updateAngularJson(ctx: PagesGeneratorContext) {
	const s = spinner();
	s.start(`Updating angular.json config`);
	const angularJson = readJSON(resolve("angular.json"));
	// Update builder
	const architectSection = angularJson.projects[ctx.project.name].architect;
	architectSection.build.options.outputPath = "dist";
	architectSection.build.options.assets.push("src/_routes.json");

	writeFile(resolve("angular.json"), JSON.stringify(angularJson, null, 2));
	s.stop(`${brandColor(`updated`)} ${dim(`\`angular.json\``)}`);
}
