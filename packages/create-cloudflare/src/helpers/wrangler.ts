import { join } from "path";
import { crash } from "@cloudflare/cli";
import { blue, brandColor, dim } from "@cloudflare/cli/colors";
import { runCommand } from "./command";
import { writeFile } from "./files";
import { detectPackageManager } from "./packages";
import type { C3Context } from "types";

const { npx } = detectPackageManager();

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

// TODO: Consider if this is the best approach, or if we should
// generate these ourselves so we can add stubbed out definitions
// for resources the user might create in the future, as well as links
// to docs for the different resource types
// This also has a bad experience if the user decides to deploy, since
// bindings will get skipped and types will be empty
export const generateTypes = async (ctx: C3Context) => {
	try {
		// We need to use runCommand instead of `wrangler` here because
		// this runs in unauthenticated contexts
		await runCommand([npx, "wrangler", "types"], {
			cwd: ctx.project.path,
			silent: true,
		});
	} catch (error) {
		return crash("Failed to fetch queues. Please try deploying again later");
	}
};

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
		return crash("Failed to fetch queues. Please try deploying again later");
	}
};

export const createQueue = async (ctx: C3Context, name: string) => {
	try {
		await wrangler(
			ctx,
			["queues", "create", name],
			`Creating queue ${blue(name)}`,
			`${brandColor("created")} ${dim(`via wrangler`)}`
		);
	} catch (error) {
		return crash(`Failed to create queue \`${name}.\``);
	}
};

type KvNamespace = {
	id: string;
	title: string;
};

export const fetchKvNamespaces = async (ctx: C3Context) => {
	try {
		const result = await wrangler(ctx, ["kv:namespace", "list"]);

		if (!result) {
			return [] as KvNamespace[];
		}

		return JSON.parse(result) as KvNamespace[];
	} catch (error) {
		return crash(
			"Failed to fetch kv namespaces. Please try deploying again later"
		);
	}
};

export const createKvNamespace = async (ctx: C3Context, name: string) => {
	try {
		const output = await wrangler(
			ctx,
			["kv:namespace", "create", name],
			`Creating KV namespace ${blue(name)}`,
			`${brandColor("created")} ${dim(`via wrangler`)}`
		);

		const match = output?.match(/binding = "(.*)", id = "(.*)"/);
		if (!match) {
			return crash("Failed to read KV namespace id");
		}

		return match[2];
	} catch (error) {
		return crash(`Failed to create KV namespace \`${name}.\``);
	}
};

type R2Bucket = {
	name: string;
};

export const fetchR2Buckets = async (ctx: C3Context) => {
	try {
		const result = await wrangler(ctx, ["r2", "bucket", "list"]);

		if (!result) {
			return [] as R2Bucket[];
		}

		return JSON.parse(result) as R2Bucket[];
	} catch (error) {
		return crash(
			"Failed to fetch r2 buckets. Please try deploying again later"
		);
	}
};

export const createR2Bucket = async (ctx: C3Context, name: string) => {
	try {
		await wrangler(
			ctx,
			["r2", "bucket", "create", name],
			`Creating R2 bucket ${blue(name)}`,
			`${brandColor("created")} ${dim(`via wrangler`)}`
		);
	} catch (error) {
		return crash(`Failed to create KV namespace \`${name}.\``);
	}
};
