import { fetchResult } from "../cfetch";
import { requireAuth } from "../user";
import type { WebSearchSearchResponse } from "./types";
import type { Config } from "@cloudflare/workers-utils";

const jsonContentType = "application/json; charset=utf-8";

export async function search(
	config: Config,
	body: { query: string; limit?: number }
): Promise<WebSearchSearchResponse> {
	const accountId = await requireAuth(config);
	return await fetchResult<WebSearchSearchResponse>(
		config,
		`/accounts/${accountId}/websearch/search`,
		{
			method: "POST",
			headers: { "content-type": jsonContentType },
			body: JSON.stringify(body),
		}
	);
}
