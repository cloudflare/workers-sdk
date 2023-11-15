import { mkdirSync } from "fs";
import { updateStatus, warn } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { processArgument } from "helpers/args";
import { installPackages, runFrameworkGenerator } from "helpers/command";
import {
	compatDateFlag,
	probePaths,
	readJSON,
	usesEslint,
	usesTypescript,
	writeFile,
	writeJSON,
} from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import {
	apiAppDirHelloJs,
	apiAppDirHelloTs,
	apiPagesDirHelloJs,
	apiPagesDirHelloTs,
} from "./templates";
import type { C3Args, FrameworkConfig, PagesGeneratorContext } from "types";

const { npm, npx } = detectPackageManager();

const generate = async (ctx: PagesGeneratorContext) => {
	const projectName = ctx.project.name;

	await runFrameworkGenerator(ctx, [projectName]);
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

	const installEslintPlugin = await shouldInstallNextOnPagesEslintPlugin(ctx);

	if (installEslintPlugin) {
		await writeEslintrc(ctx);
	}

	// Add some dev dependencies
	process.chdir(projectName);
	const packages = [
		"@cloudflare/next-on-pages@1",
		"vercel",
		...(installEslintPlugin ? ["eslint-plugin-next-on-pages"] : []),
	];
	await installPackages(packages, {
		dev: true,
		startText: "Adding the Cloudflare Pages adapter",
		doneText: `${brandColor(`installed`)} ${dim(packages.join(", "))}`,
	});
};

export const shouldInstallNextOnPagesEslintPlugin = async (
	ctx: PagesGeneratorContext
): Promise<boolean> => {
	const eslintUsage = usesEslint(ctx);

	if (!eslintUsage.used) return false;

	if (eslintUsage.configType !== ".eslintrc.json") {
		warn(
			`Expected .eslintrc.json from Next.js scaffolding but found ${eslintUsage.configType} instead`
		);
		return false;
	}

	return await processArgument(ctx.args, "eslint-plugin" as keyof C3Args, {
		type: "confirm",
		question: "Do you want to use the next-on-pages eslint-plugin?",
		label: "eslint-plugin",
		defaultValue: true,
	});
};

export const writeEslintrc = async (
	ctx: PagesGeneratorContext
): Promise<void> => {
	const eslintConfig = readJSON(`${ctx.project.name}/.eslintrc.json`);

	eslintConfig.plugins ??= [];
	eslintConfig.plugins.push("eslint-plugin-next-on-pages");

	if (typeof eslintConfig.extends === "string") {
		eslintConfig.extends = [eslintConfig.extends];
	}
	eslintConfig.extends ??= [];
	eslintConfig.extends.push("plugin:eslint-plugin-next-on-pages/recommended");

	writeJSON(`${ctx.project.name}/.eslintrc.json`, eslintConfig, 2);
};

const config: FrameworkConfig = {
	generate,
	configure,
	displayName: "Next",
	getPackageScripts: async () => {
		const isNpm = npm === "npm";
		const isBun = npm === "bun";
		const isNpmOrBun = isNpm || isBun;
		const nextOnPagesScope = isNpmOrBun ? "@cloudflare/" : "";
		const nextOnPagesCommand = `${nextOnPagesScope}next-on-pages`;
		const pmCommand = isNpmOrBun ? npx : npm;
		const pagesDeployCommand = isNpm ? "npm run" : isBun ? "bun" : pmCommand;
		return {
			"pages:build": `${pmCommand} ${nextOnPagesCommand}`,
			"pages:deploy": `${pagesDeployCommand} pages:build && wrangler pages deploy .vercel/output/static`,
			"pages:watch": `${pmCommand} ${nextOnPagesCommand} --watch`,
			"pages:dev": `${pmCommand} wrangler pages dev .vercel/output/static ${await compatDateFlag()} --compatibility-flag=nodejs_compat`,
		};
	},
	testFlags: [
		"--typescript",
		"--no-install",
		"--eslint",
		"--tailwind",
		"--src-dir",
		"--app",
		"--import-alias",
		"@/*",
	],
	compatibilityFlags: ["nodejs_compat"],
};
export default config;
