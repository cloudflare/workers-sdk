import { resolve } from "node:path";
import { logRaw } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { compatDateFlag } from "helpers/compatDate";
import { readFile, readJSON, writeFile } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import { installPackages } from "helpers/packages";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	await runFrameworkGenerator(ctx, [
		ctx.project.name,
		"--ssr",
		"--server-routing" /** Dev Preview API */,
	]);
	logRaw("");
};

const configure = async (ctx: C3Context) => {
	updateAngularJson(ctx);
	await updateAppCode();
	await installCFWorker();
};

async function installCFWorker() {
	await installPackages(["xhr2"], {
		dev: true,
		startText: "Installing additional dependencies",
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

	// Update an app server routes file to:
	const appServerRoutesPath = "src/app/app.routes.server.ts";
	const appRoutes = readFile(resolve(appServerRoutesPath));
	const newAppRoutes = appRoutes.replace(
		"RenderMode.Prerender",
		"RenderMode.Server",
	);
	writeFile(resolve(appServerRoutesPath), newAppRoutes);
	s.stop(`${brandColor(`updated`)} ${dim(appServerRoutesPath)}`);

	// Remove unwanted dependencies
	s.start(`Updating package.json`);
	const packageJsonPath = resolve("package.json");
	const packageManifest = readJSON(packageJsonPath);

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
	architectSection.build.options.outputMode = "server";
	architectSection.build.options.ssr.experimentalPlatform = "neutral";
	architectSection.build.options.assets.push("src/_routes.json");

	writeFile(resolve("angular.json"), JSON.stringify(angularJson, null, 2));
	s.stop(`${brandColor(`updated`)} ${dim(`\`angular.json\``)}`);
}

const config: TemplateConfig = {
	configVersion: 1,
	id: "angular",
	frameworkCli: "@angular/create",
	displayName: "Angular",
	platform: "pages",
	copyFiles: {
		path: "./templates",
	},
	devScript: "start",
	deployScript: "deploy",
	previewScript: "start",
	generate,
	configure,
	transformPackageJson: async () => ({
		scripts: {
			start: `${npm} run build && wrangler pages dev dist/cloudflare ${await compatDateFlag()}`,
			build: `ng build && ${npm} run process`,
			process: "node ./tools/copy-files.mjs",
			deploy: `${npm} run build && wrangler pages deploy dist/cloudflare`,
		},
	}),
};
export default config;
