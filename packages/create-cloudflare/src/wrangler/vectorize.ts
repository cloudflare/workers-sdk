import { crash } from "@cloudflare/cli";
import { blue, brandColor, dim } from "@cloudflare/cli/colors";
import { wrangler } from ".";
import type { C3Context } from "types";

export type VectorizeIndex = {
	name: string;
	description?: string;
	config?: {
		dimensions: number;
		metric: string;
	};
};

export const fetchVectorizeIndices = async (ctx: C3Context) => {
	try {
		const result = await wrangler(ctx, ["vectorize", "list", "--json"]);

		console.log(result);

		if (
			!result ||
			result.includes(`You haven't created any indexes on this account`)
		) {
			return [] as VectorizeIndex[];
		}

		const lines = result.split("\n").slice(1); // remove header line
		console.log(lines.join("\n"));
		return JSON.parse(lines.join("\n")) as VectorizeIndex[];
	} catch (error) {
		console.log(error);
		return crash("Failed to fetch vectorize indices. Please try again later");
	}
};

export const createVectorizeIndex = async (ctx: C3Context, name: string) => {
	try {
		await wrangler(
			ctx,
			["vectorize", "create", name],
			`Creating vectorize index ${blue(name)}`,
			`${brandColor("created")} ${dim(`via wrangler`)}`,
		);
		console.log("creating vectorize index");
		return { name };
	} catch (error) {
		return crash(`Failed to create vectorize index \`${name}.\``);
	}
};
