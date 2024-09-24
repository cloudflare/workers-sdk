import { resolve } from "node:path";
import { logRaw } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { readFile, readJSON, writeFile } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import { installPackages } from "helpers/packages";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [ctx.project.name, "--ssr"]);
	logRaw("");
};

const configure = async (ctx: C3Context) => {
	updateAngularJson(ctx);
	await updateAppCode();
	await installCFWorker();
};

async function installCFWorker() {
	await installPackages(["@cloudflare/workers-types", "wrangler"], {
		dev: true,
		startText: "Installing adapter dependencies",
		doneText: `${brandColor("installed")} ${dim(`via \`${npm} install\``)}`,
	});
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
			"providers: [provideHttpClient(withFetch()), ",
		);
	writeFile(resolve(appConfigPath), newAppConfig);
	s.stop(`${brandColor(`updated`)} ${dim(appConfigPath)}`);

	// Remove unwanted dependencies
	s.start(`Updating package.json`);
	const packageJsonPath = resolve("package.json");
	const packageManifest = readJSON(packageJsonPath);

	delete packageManifest["dependencies"]["@angular/ssr"];
	delete packageManifest["dependencies"]["express"];
	delete packageManifest["devDependencies"]["@types/express"];

	writeFile(packageJsonPath, JSON.stringify(packageManifest, null, 2));
	s.stop(`${brandColor(`updated`)} ${dim(`\`package.json\``)}`);
}

function updateAngularJson(ctx: C3Context) {
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

const config: TemplateConfig = {
	configVersion: 1,
	id: "angular",
	frameworkCli: "@angular/create",
	displayName: "Angular",
	platform: "workers",
	copyFiles: {
		path: "./templates",
	},
	path: "templates-experimental/angular",
	devScript: "start",
	deployScript: "deploy",
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			start: `${npm} run build && wrangler dev`,
			build: `ng build && ${npm} run process`,
			process: "node ./tools/alter-polyfills.mjs",
			deploy: `${npm} run build && wrangler deploy`,
		},
	}),
};
export default config;
