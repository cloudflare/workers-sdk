import { crash } from "@cloudflare/cli";
import { blue, brandColor, dim } from "@cloudflare/cli/colors";
import { wrangler } from ".";
import type { C3Context } from "types";

export type R2Bucket = {
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
			"Failed to fetch r2 buckets. Please try deploying again later",
		);
	}
};

export const createR2Bucket = async (
	ctx: C3Context,
	name: string,
): Promise<R2Bucket> => {
	try {
		await wrangler(
			ctx,
			["r2", "bucket", "create", name],
			`Creating R2 bucket ${blue(name)}`,
			`${brandColor("created")} ${dim(`via wrangler`)}`,
		);
		return { name };
	} catch (error) {
		return crash(`Failed to create KV namespace \`${name}.\``);
	}
};
