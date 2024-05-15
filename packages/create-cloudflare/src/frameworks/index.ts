import { crash, logRaw, updateStatus } from "@cloudflare/cli";
import { dim } from "@cloudflare/cli/colors";
import { quoteShellArgs, runCommand } from "helpers/command";
import { detectPackageManager } from "helpers/packageManagers";
import clisPackageJson from "./package.json";
import type { C3Context } from "types";

export const getFrameworkCli = (ctx: C3Context, withVersion = true) => {
	if (!ctx.template) {
		return crash("Framework not specified.");
	}

	const framework = ctx.template
		.id as keyof typeof clisPackageJson.frameworkCliMap;
	const frameworkCli = clisPackageJson.frameworkCliMap[
		framework
	] as keyof typeof clisPackageJson.dependencies;
	const version = clisPackageJson.dependencies[frameworkCli];
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
};
