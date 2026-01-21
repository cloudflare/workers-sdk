import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import * as metrics from "../metrics";
import openInBrowser from "../open-in-browser";
import { runSearch } from "./helpers";

export const docs = createCommand({
	metadata: {
		description: "📚 Open Wrangler's command documentation in your browser",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	args: {
		search: {
			describe:
				"Enter search terms (e.g. the wrangler command) you want to know more about",
			type: "string",
			array: true,
		},
		yes: {
			alias: "y",
			type: "boolean",
			describe: "Takes you to the docs, even if search fails",
		},
	},
	positionalArgs: ["search"],
	async handler(args, { config }) {
		//if no command is provided, open the docs homepage
		//or, if a command IS provided, but we can't find anything, open the docs homepage
		let urlToOpen =
			args.yes || !args.search || args.search.length === 0
				? "https://developers.cloudflare.com/workers/wrangler/commands/"
				: "";

		if (args.search && args.search.length > 0) {
			const searchTerm = args.search.join(" ");
			const searchResult = await runSearch(searchTerm);

			urlToOpen = searchResult ?? urlToOpen;
		}

		if (!urlToOpen) {
			return;
		}

		logger.log(`Opening a link in your default browser: ${urlToOpen}`);
		await openInBrowser(urlToOpen);
		metrics.sendMetricsEvent("view docs", {
			sendMetrics: config.send_metrics,
		});
	},
});
