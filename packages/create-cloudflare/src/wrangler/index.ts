import { crash } from "@cloudflare/cli";
import { runCommand } from "helpers/command";
import { detectPackageManager } from "helpers/packageManagers";
import type { C3Context } from "types";

const { npx } = detectPackageManager();

// A convenience wrapper for wrangler commands
export const wrangler = async (
	ctx: C3Context,
	args: string[],
	startText?: string,
	doneText?: string,
) => {
	if (!ctx.account?.id) {
		crash("Failed to read Cloudflare account.");
		return;
	}

	const CLOUDFLARE_ACCOUNT_ID = ctx.account.id;

	const cmd = [npx, "wrangler", ...args];

	// Exception handling is done by the caller so they have more control over what
	// to do in the event of an error.
	return runCommand(cmd, {
		cwd: ctx.project.path,
		env: { CLOUDFLARE_ACCOUNT_ID },
		silent: true,
		startText,
		doneText,
	});
};
