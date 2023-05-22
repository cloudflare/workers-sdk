#!/usr/bin/env node
import { resolve } from "path";
import { chdir } from "process";
import { FrameworkMap, supportedFramework } from "frameworks/index";
import { crash, endSection, startSection } from "helpers/cli";
import { dim, brandColor } from "helpers/colors";
import {
	detectPackageManager,
	installWrangler,
	retry,
	runCommand,
} from "helpers/command";
import { readJSON, writeFile } from "helpers/files";
import { selectInput, spinner } from "helpers/interactive";
import {
	offerToDeploy,
	printSummary,
	runDeploy,
	setupProjectDirectory,
} from "./common";
import type { Option } from "helpers/interactive";
import type { PagesGeneratorArgs, PagesGeneratorContext } from "types";

/** How many times to retry the create project command before failing. */
const CREATE_PROJECT_RETRIES = 3;

const { npx } = detectPackageManager();

const defaultFrameworkConfig = {
	deployCommand: "pages:deploy",
	devCommand: "pages:dev",
};

export const runPagesGenerator = async (args: PagesGeneratorArgs) => {
	const { name, relativePath, path } = setupProjectDirectory(args);
	const framework = await getFrameworkSelection(args);

	const frameworkConfig = FrameworkMap[framework];
	const ctx: PagesGeneratorContext = {
		project: {
			name,
			relativePath,
			path,
		},
		framework: {
			name: framework,
			config: {
				...defaultFrameworkConfig,
				...frameworkConfig,
			},
		},
		args,
	};

	// Generate
	const { generate, configure } = FrameworkMap[framework];
	await generate({ ...ctx });

	// Configure
	startSection("Configuring your application for Cloudflare", "Step 2 of 3");
	if (configure) {
		await configure({ ...ctx });
	}
	await updatePackageScripts(ctx);
	endSection(`Application configured`);

	// Deploy
	await offerToDeploy(ctx);
	await createProject(ctx);
	await runDeploy(ctx);

	// Summary
	await printSummary(ctx);
};

const getFrameworkSelection = async (args: PagesGeneratorArgs) => {
	const frameworkOptions = Object.entries(FrameworkMap).map(
		([key, { displayName }]) => ({
			label: displayName,
			value: key,
		})
	);

	const framework = await selectInput({
		question: "Which development framework do you want to use?",
		options: frameworkOptions,
		renderSubmitted: (option: Option) => {
			return `${brandColor("framework")} ${dim(option.label)}`;
		},
		initialValue: args.framework,
	});

	// Validate answers
	framework || crash("A framework must be selected to continue.");
	if (!supportedFramework(framework)) {
		crash(`Unsupported framework: ${framework}`);
	}

	return framework;
};

// Add/Update commands in the `scripts` section of package.json
const updatePackageScripts = async (ctx: PagesGeneratorContext) => {
	chdir(ctx.project.path);

	// Install wrangler so that the dev/deploy commands work
	await installWrangler();

	const { packageScripts } = ctx.framework?.config ?? {};
	if (packageScripts) {
		const s = spinner();
		// s.start(`Adding dev and deployment commands to \`package.json\``);
		s.start(`Adding command scripts`, `for development and deployment`);

		const pkgJsonPath = resolve("package.json");
		const pkgConfig = readJSON(pkgJsonPath);

		Object.entries(packageScripts).forEach(([target, command]) => {
			pkgConfig.scripts[target] = command;
		});

		writeFile(pkgJsonPath, JSON.stringify(pkgConfig, null, 2));
		s.stop(`${brandColor("added")} ${dim("commands to `package.json`")}`);
	}
};

const createProject = async (ctx: PagesGeneratorContext) => {
	if (ctx.args.deploy === false) return;
	if (!ctx.account?.id) {
		crash("Failed to read Cloudflare account.");
		return;
	}
	const CLOUDFLARE_ACCOUNT_ID = ctx.account.id;
	const cmd = `${npx} wrangler pages project create ${ctx.project.name} --production-branch main`;

	try {
		await retry(CREATE_PROJECT_RETRIES, async () =>
			runCommand(cmd, {
				silent: true,
				cwd: ctx.project.path,
				env: { CLOUDFLARE_ACCOUNT_ID },
				startText: "Creating Pages project",
				doneText: `${brandColor("created")} ${dim(`via \`${cmd}\``)}`,
			})
		);
	} catch (error) {
		crash("Failed to create pages application. See output above.");
	}
};
