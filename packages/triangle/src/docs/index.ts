import { printWranglerBanner } from "..";
import { readConfig } from "../config";
import { logger } from "../logger";
import * as metrics from "../metrics";
import openInBrowser from "../open-in-browser";
import { runSearch } from "./helpers";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function docsOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("command", {
			describe: "Enter the wrangler command you want to know more about",
			type: "string",
			array: true,
		})
		.option("yes", {
			alias: "y",
			type: "boolean",
			description: "Takes you to the docs, even if search fails",
		});
}

export async function docsHandler(
	args: StrictYargsOptionsToInterface<typeof docsOptions>
) {
	//if no command is provided, open the docs homepage
	//or, if a command IS provided, but we can't find anything, open the docs homepage
	let urlToOpen =
		args.yes || !args.command || args.command.length === 0
			? "https://developers.cloudflare.com/workers/wrangler/commands/"
			: "";

	if (args.command && args.command.length > 0) {
		const searchTerm = args.command.join(" ");
		const searchResult = await runSearch(searchTerm);

		urlToOpen = searchResult ?? urlToOpen;
	}

	if (!urlToOpen) {
		return;
	}
	await printWranglerBanner();

	logger.log(`Opening a link in your default browser: ${urlToOpen}`);
	await openInBrowser(urlToOpen);
	const config = readConfig(undefined, args);
	await metrics.sendMetricsEvent("view docs", {
		sendMetrics: config.send_metrics,
	});
}
