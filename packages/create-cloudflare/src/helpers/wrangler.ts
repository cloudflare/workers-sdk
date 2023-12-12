import { crash } from "@cloudflare/cli";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { runCommand } from "./command";
import { detectPackageManager } from "./packages";
import type { C3Context } from "types";

const { npx } = detectPackageManager();

/*
  AUTHENTICATED COMMANDS

  It's assumed that for the commands run below, `wranglerLogin` has already been invoked
  and that an account is available in context. They should not be run before `offerToDeploy`.

*/

type Queue = {
	queue_name: string;
};

export const fetchQueues = async (ctx: C3Context) => {
	try {
		const result = await wrangler(ctx, ["queues", "list"]);

		if (!result) {
			return [] as Queue[];
		}

		return JSON.parse(result) as Queue[];
	} catch (error) {
		crash("Failed to fetch queues. Please try deploying again later");
		return [];
	}
};

export const createQueue = async (ctx: C3Context, name: string) => {
	try {
		await wrangler(
			ctx,
			["queues", "create", name],
			`Creating queue ${name}`,
			`${brandColor("created")} ${dim(`via wrangler`)}`
		);
	} catch (error) {
		crash(`Failed to create queue \`${name}.\``);
		return [];
	}
};

// A convenience wrapper for wrangler commands
export const wrangler = async (
	ctx: C3Context,
	args: string[],
	startText?: string,
	doneText?: string
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
