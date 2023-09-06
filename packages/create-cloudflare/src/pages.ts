#!/usr/bin/env node
import { resolve } from "path";
import { chdir } from "process";
import { FrameworkMap, supportedFramework } from "frameworks/index";
import { processArgument } from "helpers/args";
import { C3_DEFAULTS, crash, endSection, startSection } from "helpers/cli";
import { dim, brandColor } from "helpers/colors";
import { installWrangler, retry, runCommand } from "helpers/command";
import { readJSON, writeFile } from "helpers/files";
import { spinner } from "helpers/interactive";
import { debug } from "helpers/logging";
import { detectPackageManager } from "helpers/packages";
import {
	getProductionBranch,
	gitCommit,
	offerGit,
	offerToDeploy,
	printSummary,
	runDeploy,
	setupProjectDirectory,
} from "./common";
import type { C3Args, PagesGeneratorContext } from "types";

/** How many times to retry the create project command before failing. */
const CREATE_PROJECT_RETRIES = 3;

/** How many times to verify the project creation before failing. */
const VERIFY_PROJECT_RETRIES = 3;

const { npx } = detectPackageManager();

const defaultFrameworkConfig = {
	deployCommand: "pages:deploy",
	devCommand: "pages:dev",
};

export const runPagesGenerator = async (args: C3Args) => {
	const { name, path } = setupProjectDirectory(args);
	const framework = await getFrameworkSelection(args);

	const frameworkConfig = FrameworkMap[framework];
	const ctx: PagesGeneratorContext = {
		project: {
			name,
			path,
		},
		framework: {
			name: framework,
			config: {
				...defaultFrameworkConfig,
				...frameworkConfig,
			},
			args: args.additionalArgs ?? [],
		},
		args,
		type: frameworkConfig.type,
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
	await offerGit(ctx);
	await gitCommit(ctx);
	endSection(`Application configured`);

	// Deploy
	await offerToDeploy(ctx);
	await createProject(ctx);
	await runDeploy(ctx);

	// Summary
	await printSummary(ctx);
};

const getFrameworkSelection = async (args: C3Args) => {
	const frameworkOptions = Object.entries(FrameworkMap).map(
		([key, { displayName }]) => ({
			label: displayName,
			value: key,
		})
	);

	const framework = await processArgument<string>(args, "framework", {
		type: "select",
		label: "framework",
		question: "Which development framework do you want to use?",
		options: frameworkOptions,
		defaultValue: C3_DEFAULTS.framework,
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

		const updatingScripts =
			Object.entries(packageScripts).filter(
				([_, cmdOrUpdater]) => typeof cmdOrUpdater === "function"
			).length > 0;

		s.start(
			`${updatingScripts ? "Updating" : "Adding"} command scripts`,
			"for development and deployment"
		);

		const pkgJsonPath = resolve("package.json");
		const pkgConfig = readJSON(pkgJsonPath);

		Object.entries(packageScripts).forEach(([target, cmdOrUpdater]) => {
			if (typeof cmdOrUpdater === "string") {
				const command = cmdOrUpdater;
				pkgConfig.scripts[target] = command;
			} else {
				const existingCommand = pkgConfig.scripts[target] as string | undefined;
				if (!existingCommand) {
					throw new Error(
						`Could not find ${target} script to update during ${ctx.framework} setup`
					);
				}
				const updater = cmdOrUpdater;
				pkgConfig.scripts[target] = updater(existingCommand);
			}
		});

		writeFile(pkgJsonPath, JSON.stringify(pkgConfig, null, 2));
		s.stop(`${brandColor("added")} ${dim("commands to `package.json`")}`);
	}
};

const createProject = async (ctx: PagesGeneratorContext) => {
	if (ctx.args.deploy === false) return;
	if (ctx.framework?.config.type === "workers") return;
	if (!ctx.account?.id) {
		crash("Failed to read Cloudflare account.");
		return;
	}
	const CLOUDFLARE_ACCOUNT_ID = ctx.account.id;

	try {
		const compatFlags = ctx.framework?.config.compatibilityFlags?.join(" ");
		const compatFlagsArg = compatFlags
			? `--compatibility-flags ${compatFlags}`
			: "";

		const productionBranch = await getProductionBranch(ctx.project.path);
		const cmd = `${npx} wrangler pages project create ${ctx.project.name} --production-branch ${productionBranch} ${compatFlagsArg}`;

		await retry(CREATE_PROJECT_RETRIES, async () =>
			runCommand(cmd, {
				// Make this command more verbose in test mode to aid
				// troubleshooting API errors
				silent: process.env.VITEST == undefined,
				cwd: ctx.project.path,
				env: { CLOUDFLARE_ACCOUNT_ID },
				startText: "Creating Pages project",
				doneText: `${brandColor("created")} ${dim(`via \`${cmd.trim()}\``)}`,
			})
		);
	} catch (error) {
		crash("Failed to create pages project. See output above.");
	}

	// Wait until the pages project is available for deployment
	try {
		const verifyProject = `${npx} wrangler pages deployment list --project-name ${ctx.project.name}`;

		await retry(VERIFY_PROJECT_RETRIES, async () =>
			runCommand(verifyProject, {
				silent: process.env.VITEST == undefined,
				cwd: ctx.project.path,
				env: { CLOUDFLARE_ACCOUNT_ID },
				startText: "Verifying Pages project",
				doneText: `${brandColor("verified")} ${dim(
					`project is ready for deployment`
				)}`,
			})
		);

		debug(`Validated pages project ${ctx.project.name}`);
	} catch (error) {
		crash("Pages project isn't ready yet. Please try deploying again later.");
	}
};
