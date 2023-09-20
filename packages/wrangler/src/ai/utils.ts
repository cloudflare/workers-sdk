import { fetchResult } from "../cfetch";
import type { Model } from "./types";

export async function aiList<ResponseType>(
	accountId: string,
	partialUrl: string
): Promise<Array<ResponseType>> {
	const pageSize = 50;
	let page = 1;
	const results = [];
	while (results.length % pageSize === 0) {
		const json: Array<ResponseType> = await fetchResult(
			`/accounts/${accountId}/ai/${partialUrl}`,
			{},
			new URLSearchParams({
				per_page: pageSize.toString(),
				page: page.toString(),
			})
		);
		page++;
		results.push(...json);
		if (json.length < pageSize) {
			break;
		}
	}
	return results;
}

export const listCatalogEntries = async (
	accountId: string
): Promise<Array<Model>> => {
	return await aiList(accountId, "models/search");
};

export function truncate(str: string, maxLen: number) {
	return str.slice(0, maxLen) + (str.length > maxLen ? "..." : "");
}
