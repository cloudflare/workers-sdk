import { crash } from "@cloudflare/cli";
import { blue, brandColor, dim } from "@cloudflare/cli/colors";
import { parseTable } from "./utils";
import { wrangler } from ".";
import type { C3Context } from "types";

export type Queue = {
	name: string;
	id?: string;
	producers?: number;
	consumers?: number;
};

export const fetchQueues = async (ctx: C3Context) => {
	try {
		const result = await wrangler(ctx, ["queues", "list"]);

		if (!result) {
			return [] as Queue[];
		}

		return parseTable<Queue>(result);
	} catch (error) {
		console.log(error);
		return crash("Failed to fetch queues. Please try deploying again later");
	}
};

export const createQueue = async (ctx: C3Context, name: string) => {
	try {
		await wrangler(
			ctx,
			["queues", "create", name],
			`Creating queue ${blue(name)}`,
			`${brandColor("created")} ${dim(`via wrangler`)}`,
		);
		return { name };
	} catch (error) {
		return crash(`Failed to create queue \`${name}.\``);
	}
};
