import { updateStatus } from "helpers/cli";
import { blue, brandColor, dim } from "helpers/colors";
import {
	detectPackageManager,
	installPackages,
	runFrameworkGenerator,
} from "helpers/command";
import { probePaths, usesTypescript, writeFile } from "helpers/files";
import { getFrameworkVersion } from "../index";
import { apiHelloJs, apiHelloTs, nextConfigJs } from "./templates";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npm, npx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const projectName = ctx.project.name;
	const version = getFrameworkVersion(ctx);

	await runFrameworkGenerator(
		ctx,
		`${npx} create-next-app@${version} ${projectName}`
	);
};

const configure = async (ctx: PagesGeneratorContext) => {
	const projectName = ctx.project.name;

	// Add a compatible function handler example
	const apiPath = probePaths(
		[
			`${projectName}/pages/api`,
			`${projectName}/src/pages/api`,
			`${projectName}/src/app/api`,
			`${projectName}/app/api`,
		],
		"Could not find the `/api` directory"
	);
	const [handlerPath, handlerFile] = usesTypescript(projectName)
		? [`${apiPath}/hello.ts`, apiHelloTs]
		: [`${apiPath}/hello.js`, apiHelloJs];
	writeFile(handlerPath, handlerFile);
	updateStatus("Created an example API route handler");

	// Add a next config that opts into edge runtime
	writeFile(`./${projectName}/next.config.js`, nextConfigJs);
	updateStatus(
		`Added experimental edge runtime flag to ${blue("next.config.js")}`
	);

	// Add some dev dependencies
	process.chdir(projectName);
	const packages = ["@cloudflare/next-on-pages", "vercel"];
	await installPackages(packages, {
		dev: true,
		startText: "Adding the Cloudflare Pages adapter",
		doneText: `${brandColor(`installed`)} ${dim(packages.join(", "))}`,
	});
};

const config: FrameworkConfig = {
	generate,
	configure,
	displayName: "Next",
	packageScripts: {
		"pages:build": `${npx} @cloudflare/next-on-pages --experimental-minify`,
		"pages:deploy": `${npm} run pages:build && wrangler pages publish .vercel/output/static`,
		"pages:watch": `${npx} @cloudflare/next-on-pages --watch`,
		"pages:dev": `${npx} wrangler pages dev .vercel/output/static --compatibility-flag=nodejs_compat`,
	},
	testFlags: [
		"--typescript",
		"--no-install",
		"--eslint",
		"--tailwind",
		"--src-dir",
		"--experimental-app",
		"--import-alias",
		'"@/*"',
	],
};
export default config;
