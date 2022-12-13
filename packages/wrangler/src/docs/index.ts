import { printWranglerBanner } from "..";
import { readConfig } from "../config";
import { logger } from "../logger";
import * as metrics from "../metrics";
import openInBrowser from "../open-in-browser";

import { ALGOLIA_API_KEY, ALGOLIA_APPLICATION_ID } from "./constants";
import type {
	CommonYargsOptions,
	YargsOptionsToInterface,
} from "../yargs-types";
import type { ArgumentsCamelCase, Argv } from "yargs";

export function docsOptions(yargs: Argv<CommonYargsOptions>) {
	return yargs.positional("command", {
		describe: "Enter the wrangler command you want to know more about",
		type: "string",
		// requiresArg: true,
	});
}

type DocsArgs = YargsOptionsToInterface<typeof docsOptions>;

export async function docsHandler(args: ArgumentsCamelCase<DocsArgs>) {
	let urlToOpen =
		"https://developers.cloudflare.com/workers/wrangler/commands/";
	await printWranglerBanner();
	if (args.command) {
		const searchResp = await fetch(
			`https://${ALGOLIA_APPLICATION_ID}-dsn.algolia.net/1/indexes/developers-cloudflare-wrangler/query`,
			{
				method: "POST",
				body: JSON.stringify({
					params: `query=${args.command}&hitsPerPage=1&getRankingInfo=0`,
				}),
				headers: {
					"X-Algolia-API-Key": ALGOLIA_API_KEY,
					"X-Algolia-Application-Id": ALGOLIA_APPLICATION_ID,
				},
			}
		);
		const searchData = (await searchResp.json()) as { hits: { url: string }[] };
		logger.debug("searchData: ", searchData);
		if (searchData.hits[0]) {
			urlToOpen = searchData.hits[0].url;
		}
	}

	logger.log(
		"Search by Algolia: https://www.algolia.com/ref/docsearch/?utm_source=https://github.com/cloudflare/wrangler2&utm_medium=referral&utm_content=powered_by&utm_campaign=docsearch"
	);
	logger.log(`Opening a link in your default browser: ${urlToOpen}`);
	await openInBrowser(urlToOpen);
	const config = readConfig(undefined, {});
	await metrics.sendMetricsEvent("view docs", {
		sendMetrics: config.send_metrics,
	});
}
