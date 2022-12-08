import { printWranglerBanner } from "..";
import { readConfig } from "../config";
import { logger } from "../logger";
import * as metrics from "../metrics";
import openInBrowser from "../open-in-browser";

export function docsOptions() {
	return {};
}

export async function docsHandler() {
	await printWranglerBanner();
	const urlToOpen =
		"https://developers.cloudflare.com/workers/wrangler/commands/";
	logger.log(`Opening a link in your default browser: ${urlToOpen}`);
	await openInBrowser(urlToOpen);
	const config = readConfig(undefined, {});
	await metrics.sendMetricsEvent("view docs", {
		sendMetrics: config.send_metrics,
	});
}
