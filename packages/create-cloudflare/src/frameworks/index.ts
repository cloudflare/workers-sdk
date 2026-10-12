import { logRaw, updateStatus } from "@cloudflare/cli-shared-helpers";
import { dim } from "@cloudflare/cli-shared-helpers/colors";
import {
	quoteShellArgs,
	runCommand,
} from "@cloudflare/cli-shared-helpers/command";
import { detectPackageManager } from "helpers/packageManagers";
import semver from "semver";
import frameworksPackageJson from "./package.json";
import type { C3Context } from "types";

export const getFrameworkCli = (ctx: C3Context, withVersion = true) => {
	if (!ctx.template) {
		throw new Error("Framework not specified.");
	}

	const frameworkCli = ctx.template
		.frameworkCli as keyof typeof frameworksPackageJson.dependencies;
	const version =
		ctx.template.frameworkCliPinnedVersion ??
		frameworksPackageJson.dependencies[frameworkCli];
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
	const nodeVersion = process.versions.node;
	const requiredNodeVersion = ctx.template.frameworkCliNodeVersion;
	if (
		requiredNodeVersion &&
		!semver.satisfies(nodeVersion, requiredNodeVersion)
	) {
		throw new Error(
			`${ctx.template.displayName} requires Node.js ${requiredNodeVersion}. You are using Node.js ${nodeVersion}. Please upgrade Node.js and try again.`
		);
	}

	const { npm, dlx } = detectPackageManager();
	// yarn cannot `yarn create@some-version` and doesn't have an npx equivalent
	// So to retain the ability to lock versions we run it with `npx` and spoof
	// the user agent so scaffolding tools treat the invocation like yarn
	const cmd = [...(npm === "yarn" ? ["npx"] : dlx), cli, ...args];
	const env =
		npm === "yarn" && !process.env.npm_config_user_agent?.startsWith("yarn")
			? { npm_config_user_agent: "yarn/1.22.22" }
			: {};

	if (ctx.args.additionalArgs?.length) {
		cmd.push(...ctx.args.additionalArgs);
	}

	updateStatus(
		`Continue with ${ctx.template.displayName} ${dim(
			`via \`${quoteShellArgs(cmd)}\``
		)}`
	);

	// newline
	logRaw("");

	await runCommand(cmd, { env });
};
