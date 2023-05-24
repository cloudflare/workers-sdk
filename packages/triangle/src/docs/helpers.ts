import assert from "node:assert";
import { fetch } from "undici";
import { logger } from "../logger";

// The ALGOLIA_APP_ID and ALGOLIA_PUBLIC_KEY are provided at esbuild time as a `define` for production and beta releases.
// Otherwise it is left undefined, which disables search.
declare const ALGOLIA_APP_ID: string;
declare const ALGOLIA_PUBLIC_KEY: string;

export async function runSearch(searchTerm: string) {
	const id = ALGOLIA_APP_ID;
	const index = "developers-cloudflare2";
	const key = ALGOLIA_PUBLIC_KEY;
	const params = new URLSearchParams({
		query: searchTerm,
		hitsPerPage: "1",
		getRankingInfo: "0",
	});

	assert(id, "Missing Algolia App ID");
	assert(key, "Missing Algolia Key");

	const searchResp = await fetch(
		`https://${id}-dsn.algolia.net/1/indexes/${index}/query`,
		{
			method: "POST",
			body: JSON.stringify({
				params: params.toString(),
			}),
			headers: {
				"X-Algolia-API-Key": key,
				"X-Algolia-Application-Id": id,
			},
		}
	);
	if (!searchResp.ok) {
		logger.error(`Could not search the docs. Please try again later.`);
		return;
	}
	const searchData = (await searchResp.json()) as { hits: { url: string }[] };
	logger.debug("searchData: ", searchData);
	if (searchData.hits[0]) {
		return searchData.hits[0].url;
	} else {
		logger.error(
			`Could not find docs for: ${searchTerm}. Please try again with another search term.`
		);
		return;
	}
}
