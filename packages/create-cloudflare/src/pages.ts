import { chdir } from "process";
import { crash } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import {
	installWrangler,
	resetPackageManager,
	retry,
	runCommand,
} from "helpers/command";
import { debug } from "helpers/logging";
import { detectPackageManager } from "helpers/packages";
import { getProductionBranch, quoteShellArgs } from "./common";
import type { TemplateConfig } from "./templateMap";
import type { C3Context } from "types";

/** How many times to retry the create project command before failing. */
const CREATE_PROJECT_RETRIES = 3;

/** How many times to verify the project creation before failing. */
const VERIFY_PROJECT_RETRIES = 3;

const { npx } = detectPackageManager();

export const runPagesGenerator = async (ctx: C3Context) => {
	const frameworkConfig = ctx.template as unknown as TemplateConfig;

	// Generate
	const { configure } = frameworkConfig;

	// Rectify discrepancies between installed node_modules and package specific
	// lockfile before potentially adding new packages in `configure`
	await resetPackageManager(ctx);

	if (configure) {
		await configure({ ...ctx });
	}
	chdir(ctx.project.path);

	// Install wrangler so that the dev/deploy commands work
	await installWrangler();
};

export const createProject = async (ctx: C3Context) => {
	if (ctx.args.deploy === false) return;
	if (ctx.template.platform === "workers") return;
	if (!ctx.account?.id) {
		crash("Failed to read Cloudflare account.");
		return;
	}
	const CLOUDFLARE_ACCOUNT_ID = ctx.account.id;

	try {
		const compatFlags = ctx.template.compatibilityFlags ?? [];
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
