import { crash } from "@cloudflare/cli";
import { blue, brandColor, dim } from "@cloudflare/cli/colors";
import { wrangler } from ".";
import type { C3Context } from "types";

export type KvNamespace = {
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
			"Failed to fetch kv namespaces. Please try deploying again later",
		);
	}
};

export const createKvNamespace = async (ctx: C3Context, name: string) => {
	try {
		const output = await wrangler(
			ctx,
			["kv:namespace", "create", name],
			`Creating KV namespace ${blue(name)}`,
			`${brandColor("created")} ${dim(`via wrangler`)}`,
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
