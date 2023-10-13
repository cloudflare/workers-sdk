import { cp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { logRaw } from "helpers/cli";
import { brandColor, dim } from "helpers/colors";
import {
	installPackages,
	runCommand,
	runFrameworkGenerator,
} from "helpers/command";
import { readFile, readJSON, writeFile } from "helpers/files";
import { spinner } from "helpers/interactive";
import { detectPackageManager } from "helpers/packages";
import { getFrameworkCli } from "../index";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { dlx, npx, npm } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const cli = getFrameworkCli(ctx);

	await runFrameworkGenerator(
		ctx,
		`${dlx} ${cli} new ${ctx.project.name} --standalone`
	);

	logRaw("");
};

const configure = async (ctx: PagesGeneratorContext) => {
	process.chdir(ctx.project.path);
	await runCommand(`${npx} ng analytics disable`, {
		silent: true,
	});
	await addSSRAdapter();
	await installCFWorker(ctx);
	await updateAppCode();
	updateAngularJson(ctx);
};

const config: FrameworkConfig = {
	generate,
	configure,
	displayName: "Angular",
	packageScripts: {
		process:
			"node ./tools/copy-worker-files.mjs && node ./tools/copy-client-files.mjs && node ./tools/bundle.mjs",
		"pages:build": `${npm} run build:ssr && ${npm} run process`,
		start: `${npm} run pages:build && wrangler pages dev dist/cloudflare --compatibility-date=2021-09-20 --experimental-local`,
		deploy: `${npm} run pages:build && wrangler pages deploy dist/cloudflare`,
	},
	deployCommand: "deploy",
	devCommand: "start",
	testFlags: ["--routing", "--style", "sass"],
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
		[
			"@cloudflare/workers-types",
			"@esbuild-plugins/node-globals-polyfill",
			"@esbuild-plugins/node-modules-polyfill",
			"@miniflare/tre@next",
			"esbuild",
			"fast-glob",
			"wrangler@beta",
		],
		{
			dev: true,
			startText: "Installing adapter dependencies",
			doneText: `${brandColor("installed")} ${dim(`via \`${npm} install\``)}`,
		}
	);
}

async function addSSRAdapter() {
	const cmd = `${npx} ng add @nguniversal/express-engine`;

	await runCommand(`${cmd} --skip-confirmation`, {
		silent: true,
		startText: "Installing Angular SSR",
		doneText: `${brandColor("installed")} ${dim(`via \`${cmd}\``)}`,
	});
}

async function updateAppCode() {
	const s = spinner();
	s.start(`Updating application code`);

	// Update an app config file to:
	// - add the `provideClientHydration()` provider to enable hydration
	// - add the `provideHttpClient(withFetch())` call to enable `fetch` usage in `HttpClient`
	const appConfigPath = "src/app/app.config.ts";
	const appConfig = readFile(resolve(appConfigPath));
	const newAppConfig =
		"import { provideClientHydration } from '@angular/platform-browser';\n" +
		"import { provideHttpClient, withFetch } from '@angular/common/http';\n" +
		appConfig.replace(
			"providers: [",
			"providers: [provideHttpClient(withFetch()), provideClientHydration(), "
		);
	writeFile(resolve(appConfigPath), newAppConfig);

	// Remove the unwanted node.js server entry-point
	await rm(resolve("server.ts"));

	s.stop(`${brandColor(`updated`)} ${dim(appConfigPath)}`);
}

function updateAngularJson(ctx: PagesGeneratorContext) {
	const s = spinner();
	s.start(`Updating angular.json config`);
	const angularJson = readJSON(resolve("angular.json"));
	const architectSection = angularJson.projects[ctx.project.name].architect;
	architectSection.build.options.outputPath = "dist/browser";
	architectSection.build.options.assets.push("src/_routes.json");
	architectSection.server.options.outputPath = "dist/server";
	architectSection.server.options.main = "src/main.server.ts";
	delete architectSection["serve-ssr"];

	writeFile(resolve("angular.json"), JSON.stringify(angularJson, null, 2));
	s.stop(`${brandColor(`updated`)} ${dim(`\`angular.json\``)}`);
}
