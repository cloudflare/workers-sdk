import { existsSync, mkdirSync } from "fs";
import { crash, updateStatus, warn } from "@cloudflare/cli";
import { processArgument } from "@cloudflare/cli/args";
import { brandColor, dim } from "@cloudflare/cli/colors";
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
	appDirNotFoundJs,
	appDirNotFoundTs,
	envDts,
	nextConfig,
	readme,
} from "./templates";
import type { TemplateConfig } from "../../src/templates";
import type { C3Args, C3Context } from "types";

const { npm, npx } = detectPackageManager();

const generate = async (ctx: C3Context) => {
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

const configure = async (ctx: C3Context) => {
	const projectPath = ctx.project.path;

	// Add a compatible function handler example
	const path = probePaths([
		`${projectPath}/pages/api`,
		`${projectPath}/src/pages/api`,
		`${projectPath}/src/app/api`,
		`${projectPath}/app/api`,
		`${projectPath}/src/app`,
		`${projectPath}/app`,
	]);

	if (!path) {
		crash("Could not find the `/api` or `/app` directory");
	}

	// App directory template may not generate an API route handler, so we update the path to add an `api` directory.
	const apiPath = path.replace(/\/app$/, "/app/api");

	const usesTs = usesTypescript(ctx);

	const appDirPath = probePaths([
		`${projectPath}/src/app`,
		`${projectPath}/app`,
	]);

	if (appDirPath) {
		// Add a custom app not-found edge route as recommended in next-on-pages
		// (see: https://github.com/cloudflare/next-on-pages/blob/2b5c8f25/packages/next-on-pages/docs/gotchas.md#not-found)
		const notFoundPath = `${appDirPath}/not-found.${usesTs ? "tsx" : "js"}`;
		if (!existsSync(notFoundPath)) {
			const notFoundContent = usesTs ? appDirNotFoundTs : appDirNotFoundJs;
			writeFile(notFoundPath, notFoundContent);
			updateStatus("Created a custom edge not-found route");
		}
	}

	const [handlerPath, handlerFile] = getApiTemplate(
		apiPath,
		usesTypescript(ctx)
	);
	writeFile(handlerPath, handlerFile);
	updateStatus("Created an example API route handler");

	if (usesTs) {
		writeFile(`${projectPath}/env.d.ts`, envDts);
		updateStatus("Created an env.d.ts file");
	}

	const installEslintPlugin = await shouldInstallNextOnPagesEslintPlugin(ctx);

	if (installEslintPlugin) {
		await writeEslintrc(ctx);
	}

	writeFile(`${projectPath}/next.config.mjs`, nextConfig);
	updateStatus("Updated the next.config.js file");

	writeFile(`${projectPath}/README.md`, readme);
	updateStatus("Updated the README file");

	await addDevDependencies(installEslintPlugin);
};

export const shouldInstallNextOnPagesEslintPlugin = async (
	ctx: C3Context
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

export const writeEslintrc = async (ctx: C3Context): Promise<void> => {
	const eslintConfig = readJSON(`${ctx.project.path}/.eslintrc.json`);

	eslintConfig.plugins ??= [];
	eslintConfig.plugins.push("eslint-plugin-next-on-pages");

	if (typeof eslintConfig.extends === "string") {
		eslintConfig.extends = [eslintConfig.extends];
	}
	eslintConfig.extends ??= [];
	eslintConfig.extends.push("plugin:eslint-plugin-next-on-pages/recommended");

	writeJSON(`${ctx.project.path}/.eslintrc.json`, eslintConfig);
};

const addDevDependencies = async (installEslintPlugin: boolean) => {
	const packages = [
		"@cloudflare/next-on-pages@1",
		"@cloudflare/workers-types",
		"vercel",
		...(installEslintPlugin ? ["eslint-plugin-next-on-pages"] : []),
	];
	await installPackages(packages, {
		dev: true,
		startText: "Adding the Cloudflare Pages adapter",
		doneText: `${brandColor(`installed`)} ${dim(packages.join(", "))}`,
	});
};

export default {
	configVersion: 1,
	id: "next",
	platform: "pages",
	displayName: "Next",
	devScript: "dev",
	previewScript: "pages:preview",
	generate,
	configure,
	transformPackageJson: async () => {
		const isNpm = npm === "npm";
		const isBun = npm === "bun";
		const isNpmOrBun = isNpm || isBun;
		const nextOnPagesScope = isNpmOrBun ? "@cloudflare/" : "";
		const nextOnPagesCommand = `${nextOnPagesScope}next-on-pages`;
		const pmCommand = isNpmOrBun ? npx : npm;
		const pagesBuildRunCommand = `${
			isNpm ? "npm run" : isBun ? "bun" : pmCommand
		} pages:build`;
		return {
			scripts: {
				"pages:build": `${pmCommand} ${nextOnPagesCommand}`,
				"pages:preview": `${pagesBuildRunCommand} && wrangler pages dev .vercel/output/static ${await compatDateFlag()} --compatibility-flag=nodejs_compat`,
				"pages:deploy": `${pagesBuildRunCommand} && wrangler pages deploy .vercel/output/static`,
			},
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
} as TemplateConfig;
