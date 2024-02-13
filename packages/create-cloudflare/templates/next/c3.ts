import { join } from "path";
import { crash, updateStatus, warn } from "@cloudflare/cli";
import { processArgument } from "@cloudflare/cli/args";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { installPackages, runFrameworkGenerator } from "helpers/command";
import {
	compatDateFlag,
	copyFile,
	probePaths,
	readJSON,
	usesEslint,
	usesTypescript,
	writeJSON,
} from "helpers/files";
import { detectPackageManager } from "helpers/packages";
import { getTemplatePath } from "../../src/templates";
import type { TemplateConfig } from "../../src/templates";
import type { C3Args, C3Context } from "types";

const { npm, npx } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	const projectName = ctx.project.name;

	await runFrameworkGenerator(ctx, [projectName]);
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

	const usesTs = usesTypescript(ctx);

	if (usesTs) {
		copyFile(join(getTemplatePath(ctx), "env.d.ts"), `${projectPath}/env.d.ts`);
		updateStatus("Created an env.d.ts file");
	}

	const installEslintPlugin = await shouldInstallNextOnPagesEslintPlugin(ctx);

	if (installEslintPlugin) {
		await writeEslintrc(ctx);
	}

	copyFile(
		join(getTemplatePath(ctx), "next.config.mjs"),
		`${projectPath}/next.config.mjs`
	);
	updateStatus("Updated the next.config.mjs file");

	copyFile(join(getTemplatePath(ctx), "README.md"), `${projectPath}/README.md`);
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
	copyFiles: {
		async selectVariant(ctx) {
			const isApp = probePaths([
				`${ctx.project.path}/src/app`,
				`${ctx.project.path}/app`,
			]);

			const isTypescript = usesTypescript(ctx);

			const dir = isApp ? "app" : "pages";
			return `${dir}/${isTypescript ? "ts" : "js"}`;
		},
		destinationDir(ctx) {
			const srcPath = probePaths([`${ctx.project.path}/src`]);
			return srcPath ? "./src" : "./";
		},
		variants: {
			"app/ts": {
				path: "./app/ts",
			},
			"app/js": {
				path: "./app/js",
			},
			"pages/ts": {
				path: "./pages/ts",
			},
			"pages/js": {
				path: "./pages/js",
			},
		},
	},
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
