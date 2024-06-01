import { crash } from "@cloudflare/cli";
import { blue, brandColor, dim } from "@cloudflare/cli/colors";
import { wrangler } from ".";
import type { C3Context } from "types";

export type D1Database = {
	name: string;
	uuid: string;
};

export const fetchD1Databases = async (ctx: C3Context) => {
	try {
		const result = await wrangler(ctx, ["d1", "list", "--json"]);

		if (!result) {
			return [] as D1Database[];
		}

		return JSON.parse(result) as D1Database[];
	} catch (error) {
		return crash(
			"Failed to fetch D1 databases. Please try deploying again later",
		);
	}
};

export const createD1Database = async (ctx: C3Context, name: string) => {
	try {
		const output = await wrangler(
			ctx,
			["d1", "create", name],
			`Creating D1 database ${blue(name)}`,
			`${brandColor("created")} ${dim(`via wrangler`)}`,
		);

		const match = output?.match(/database_name = "(.*)"\ndatabase_id = "(.*)"/);
		if (!match) {
			return crash("Failed to read D1 database name");
		}

		return {
			name: match[1],
			uuid: match[2],
		};
	} catch (error) {
		return crash(`Failed to create D1 database \`${name}.\``);
	}
};
