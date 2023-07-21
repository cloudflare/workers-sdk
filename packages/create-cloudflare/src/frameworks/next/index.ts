import { mkdirSync } from "fs";
import { updateStatus } from "helpers/cli";
import { brandColor, dim } from "helpers/colors";
import { installPackages, runFrameworkGenerator } from "helpers/command";
import { probePaths, usesTypescript, writeFile } from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import { getFrameworkVersion } from "../index";
import {
	apiAppDirHelloJs,
	apiAppDirHelloTs,
	apiPagesDirHelloJs,
	apiPagesDirHelloTs,
} from "./templates";
import type { PagesGeneratorContext, FrameworkConfig } from "types";

const { npm, npx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const projectName = ctx.project.name;
	const version = getFrameworkVersion(ctx);

	await runFrameworkGenerator(
		ctx,
		`${npm} create next-app@${version} ${projectName}`
	);
};

const getApiTemplate = (
	apiPath: string,
	isTypescript: boolean
): [string, string] => {
	const isAppDir = /\/app\/api$/.test(apiPath);

	if (isAppDir) {
		// App directory uses route handlers that are defined in a subdirectory (`/api/hello/route.ts`).
		const routeHandlerPath = `${apiPath}/hello`;
		mkdirSync(routeHandlerPath, { recursive: true });

		return isTypescript
			? [`${routeHandlerPath}/route.ts`, apiAppDirHelloTs]
			: [`${routeHandlerPath}/route.js`, apiAppDirHelloJs];
	}

	return isTypescript
		? [`${apiPath}/hello.ts`, apiPagesDirHelloTs]
		: [`${apiPath}/hello.js`, apiPagesDirHelloJs];
};

const configure = async (ctx: PagesGeneratorContext) => {
	const projectName = ctx.project.name;

	// Add a compatible function handler example
	const path = probePaths(
		[
			`${projectName}/pages/api`,
			`${projectName}/src/pages/api`,
			`${projectName}/src/app/api`,
			`${projectName}/app/api`,
			`${projectName}/src/app`,
			`${projectName}/app`,
		],
		"Could not find the `/api` or `/app` directory"
	);

	// App directory template may not generate an API route handler, so we update the path to add an `api` directory.
	const apiPath = path.replace(/\/app$/, "/app/api");

	const [handlerPath, handlerFile] = getApiTemplate(
		apiPath,
		usesTypescript(projectName)
	);
	writeFile(handlerPath, handlerFile);
	updateStatus("Created an example API route handler");

	// Add some dev dependencies
	process.chdir(projectName);
	const packages = ["@cloudflare/next-on-pages@1", "vercel"];
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
		"pages:build": `${npx} @cloudflare/next-on-pages@1`,
		"pages:deploy": `${npm} run pages:build && wrangler pages deploy .vercel/output/static`,
		"pages:watch": `${npx} @cloudflare/next-on-pages@1 --watch`,
		"pages:dev": `${npx} wrangler pages dev .vercel/output/static --compatibility-flag=nodejs_compat`,
	},
	testFlags: [
		"--typescript",
		"--no-install",
		"--eslint",
		"--tailwind",
		"--src-dir",
		"--app",
		"--import-alias",
		'"@/*"',
	],
	compatibilityFlags: ["nodejs_compat"],
};
export default config;
