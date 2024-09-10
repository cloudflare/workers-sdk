import { join } from "path";
import { updateStatus, warn } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { inputPrompt, spinner } from "@cloudflare/cli/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import {
	copyFile,
	probePaths,
	readFile,
	readJSON,
	usesEslint,
	usesTypescript,
	writeFile,
	writeJSON,
} from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import { installPackages } from "helpers/packages";
import { getTemplatePath } from "../../src/templates";
import type { TemplateConfig } from "../../src/templates";
import type { C3Context } from "types";

const { npm, npx } = detectPackageManager();

const generate = async (ctx: C3Context) => {
	const projectName = ctx.project.name;

	await runFrameworkGenerator(ctx, [projectName]);

	const wranglerToml = readFile(join(getTemplatePath(ctx), "wrangler.toml"));

	// Note: here we add `# KV Example:` to the toml file for the KV example, we don't actually
	//       include the comment in the template wrangler.toml file just so to keep it identical
	//       and consistent with that of all the other frameworks
	//       (instead of making it a special case which needs extra care)
	const newTomlContent = wranglerToml.replace(
		/#\s+\[\[kv_namespaces\]\]\n#\s+binding\s+=\s+"MY_KV_NAMESPACE"\n#\s+id\s+=\s+"[a-zA-Z0-9]+?"/,
		($1) => `# KV Example:\n${$1}`,
	);

	if (!/# KV Example/.test(newTomlContent)) {
		// This should never happen to users, it is a check mostly so that
		// if the toml file is changed in a way that breaks the "KV Example" addition
		// the C3 Next.js e2e runs will fail with this
		throw new Error("Failed to properly generate the wrangler.toml file");
	}

	writeFile(join(ctx.project.path, "wrangler.toml"), newTomlContent);

	updateStatus("Created wrangler.toml file");
};

const updateNextConfig = () => {
	const s = spinner();

	const configFile = "next.config.mjs";
	s.start(`Updating \`${configFile}\``);

	const configContent = readFile(configFile);

	const updatedConfigFile =
		`import { setupDevPlatform } from '@cloudflare/next-on-pages/next-dev';

		// Here we use the @cloudflare/next-on-pages next-dev module to allow us to use bindings during local development
		// (when running the application with \`next dev\`), for more information see:
		// https://github.com/cloudflare/next-on-pages/blob/main/internal-packages/next-dev/README.md
		if (process.env.NODE_ENV === 'development') {
		  await setupDevPlatform();
		}

		`.replace(/\n\t*/g, "\n") + configContent;

	writeFile(configFile, updatedConfigFile);

	s.stop(`${brandColor(`updated`)} ${dim(`\`${configFile}\``)}`);
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
		throw new Error("Could not find the `/api` or `/app` directory");
	}

	const usesTs = usesTypescript(ctx);

	if (usesTs) {
		copyFile(
			join(getTemplatePath(ctx), "env.d.ts"),
			join(projectPath, "env.d.ts"),
		);
		updateStatus("Created an env.d.ts file");
	}

	const installEslintPlugin = await shouldInstallNextOnPagesEslintPlugin(ctx);

	if (installEslintPlugin) {
		await writeEslintrc(ctx);
	}

	updateNextConfig();

	copyFile(
		join(getTemplatePath(ctx), "README.md"),
		join(projectPath, "README.md"),
	);
	updateStatus("Updated the README file");

	await addDevDependencies(installEslintPlugin);
};

export const shouldInstallNextOnPagesEslintPlugin = async (
	ctx: C3Context,
): Promise<boolean> => {
	const eslintUsage = usesEslint(ctx);

	if (!eslintUsage.used) {
		return false;
	}

	if (eslintUsage.configType !== ".eslintrc.json") {
		warn(
			`Expected .eslintrc.json from Next.js scaffolding but found ${eslintUsage.configType} instead`,
		);
		return false;
	}

	return await inputPrompt({
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
	frameworkCli: "create-next-app",
	platform: "pages",
	displayName: "Next",
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
	transformPackageJson: async (_, ctx) => {
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
				preview: `${pagesBuildRunCommand} && wrangler pages dev`,
				deploy: `${pagesBuildRunCommand} && wrangler pages deploy`,
				...(usesTypescript(ctx) && {
					"cf-typegen": `wrangler types --env-interface CloudflareEnv env.d.ts`,
				}),
			},
		};
	},
	devScript: "dev",
	previewScript: "preview",
	deployScript: "deploy",
	compatibilityFlags: ["nodejs_compat"],
} as TemplateConfig;
