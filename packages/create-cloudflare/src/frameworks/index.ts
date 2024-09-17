import { logRaw, updateStatus } from "@cloudflare/cli";
import { dim } from "@cloudflare/cli/colors";
import { quoteShellArgs, runCommand } from "helpers/command";
import { detectPackageManager } from "helpers/packageManagers";
import { isInsideGitRepo } from "../git";
import frameworksPackageJson from "./package.json";
import type { C3Context } from "types";

export const getFrameworkCli = (ctx: C3Context, withVersion = true) => {
	if (!ctx.template) {
		throw new Error("Framework not specified.");
	}

	const frameworkCli = ctx.template
		.frameworkCli as keyof typeof frameworksPackageJson.dependencies;
	const version = frameworksPackageJson.dependencies[frameworkCli];
	return withVersion ? `${frameworkCli}@${version}` : frameworkCli;
};

/**
 * Run a scaffolding tool with `npx` or its equivalent. The `ctx` object must be
 * populated with a framework that exists `src/frameworks/package.json`.
 *
 * @param ctx - The C3 context object
 * @param args - An array of additional arguments to be used
 */
export const runFrameworkGenerator = async (ctx: C3Context, args: string[]) => {
	const cli = getFrameworkCli(ctx, true);
	const { npm, dlx } = detectPackageManager();
	// yarn cannot `yarn create@some-version` and doesn't have an npx equivalent
	// So to retain the ability to lock versions we run it with `npx` and spoof
	// the user agent so scaffolding tools treat the invocation like yarn
	const cmd = [...(npm === "yarn" ? ["npx"] : dlx), cli, ...args];
	const env = npm === "yarn" ? { npm_config_user_agent: "yarn" } : {};

	if (ctx.args.additionalArgs?.length) {
		cmd.push(...ctx.args.additionalArgs);
	}

	updateStatus(
		`Continue with ${ctx.template.displayName} ${dim(
			`via \`${quoteShellArgs(cmd)}\``,
		)}`,
	);

	// newline
	logRaw("");

	await runCommand(cmd, { env });

	// When running e2e tests, commit the result of the scaffolding tool to facilitate
	// diffing what new code is added by C3 as part of the process
	if (process.env.SAVE_DIFFS) {
		const cmdEnv = {
			silent: true,
			cwd: ctx.project.path,
		};

		// Certain framework scaffolders commit by default, which implies that they initialize a git repo.
		// If that's the case and we are in a repo, so we should skip this step.
		if (!isInsideGitRepo(ctx.project.path)) {
			await runCommand(["git", "init"], cmdEnv);
			await runCommand(["git", "add", "."], cmdEnv);

			const commitMessage = `Initial commit by ${cli}`;
			await runCommand(["git", "commit", "-m", commitMessage], cmdEnv);
		}
	}
};
