import { resolve } from "path";
import { chdir } from "process";
import { crash, endSection, startSection } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import {
	installWrangler,
	resetPackageManager,
	retry,
	runCommand,
} from "helpers/command";
import { readJSON, writeFile } from "helpers/files";
import { debug } from "helpers/logging";
import { detectPackageManager } from "helpers/packages";
import {
	getProductionBranch,
	gitCommit,
	offerGit,
	offerToDeploy,
	printSummary,
	quoteShellArgs,
	runDeploy,
} from "./common";
import { copyTemplateFiles } from "./templateMap";
import type { C3Context, FrameworkConfig } from "types";

/** How many times to retry the create project command before failing. */
const CREATE_PROJECT_RETRIES = 3;

/** How many times to verify the project creation before failing. */
const VERIFY_PROJECT_RETRIES = 3;

const { npx } = detectPackageManager();

const defaultFrameworkConfig = {
	deployCommand: ["pages:deploy"],
	devCommand: ["pages:dev"],
};

export const runPagesGenerator = async (ctx: C3Context) => {
	const frameworkConfig = ctx.template as unknown as FrameworkConfig;
	ctx.framework = {
		config: {
			...defaultFrameworkConfig,
			...frameworkConfig,
		},
		args: ctx.args.additionalArgs ?? [],
	};

	// Generate
	const { generate, configure } = frameworkConfig;
	await generate({ ...ctx });
	await copyTemplateFiles(ctx);
	endSection(`Application created`);

	// Configure
	startSection("Configuring your application for Cloudflare", "Step 2 of 3");

	// Rectify discrepancies between installed node_modules and package specific
	// lockfile before potentially adding new packages in `configure`
	await resetPackageManager(ctx);

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

// Add/Update commands in the `scripts` section of package.json
const updatePackageScripts = async (ctx: C3Context) => {
	chdir(ctx.project.path);

	// Install wrangler so that the dev/deploy commands work
	await installWrangler();

	const { getPackageScripts } = ctx.framework?.config ?? {};
	const packageScripts = getPackageScripts ? await getPackageScripts() : {};
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

const createProject = async (ctx: C3Context) => {
	if (ctx.args.deploy === false) return;
	if (ctx.framework?.config.type === "workers") return;
	if (!ctx.account?.id) {
		crash("Failed to read Cloudflare account.");
		return;
	}
	const CLOUDFLARE_ACCOUNT_ID = ctx.account.id;

	try {
		const compatFlags = ctx.framework?.config.compatibilityFlags ?? [];
		const productionBranch = await getProductionBranch(ctx.project.path);
		const cmd: string[] = [
			npx,
			"wrangler",
			"pages",
			"project",
			"create",
			ctx.project.name,
			"--production-branch",
			productionBranch,
			...(compatFlags.length > 0
				? ["--compatibility-flags", ...compatFlags]
				: []),
		];

		await retry(
			{
				times: CREATE_PROJECT_RETRIES,
				exitCondition: (e) => {
					return (
						e instanceof Error &&
						// if the error is regarding name duplication we can exist as retrying is not going to help
						e.message.includes(
							"A project with this name already exists. Choose a different project name."
						)
					);
				},
			},
			async () =>
				runCommand(cmd, {
					// Make this command more verbose in test mode to aid
					// troubleshooting API errors
					silent: process.env.VITEST == undefined,
					cwd: ctx.project.path,
					env: { CLOUDFLARE_ACCOUNT_ID },
					startText: "Creating Pages project",
					doneText: `${brandColor("created")} ${dim(
						`via \`${quoteShellArgs(cmd)}\``
					)}`,
				})
		);
	} catch (error) {
		crash("Failed to create pages project. See output above.");
	}

	// Wait until the pages project is available for deployment
	try {
		const verifyProject = [
			npx,
			"wrangler",
			"pages",
			"deployment",
			"list",
			"--project-name",
			ctx.project.name,
		];

		await retry({ times: VERIFY_PROJECT_RETRIES }, async () =>
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
