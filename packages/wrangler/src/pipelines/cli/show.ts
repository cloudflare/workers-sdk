import { readConfig } from "../../config";
import { logger } from "../../logger";
import * as metrics from "../../metrics";
import { requireAuth } from "../../user";
import { printWranglerBanner } from "../../wrangler-banner";
import { getPipeline } from "../client";
import { validateName } from "../validate";
import type {
	CommonYargsOptions,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";
import type { Argv } from "yargs";

export function addShowOptions(yargs: Argv<CommonYargsOptions>) {
	return yargs.positional("pipeline", {
		type: "string",
		describe: "The name of the Pipeline to show",
		demandOption: true,
	});
}

export async function showPipelineHandler(
	args: StrictYargsOptionsToInterface<typeof addShowOptions>
) {
	await printWranglerBanner();
	const config = readConfig(args);
	const accountId = await requireAuth(config);
	const name = args.pipeline;

	validateName("pipeline name", name);

	logger.log(`Retrieving config for Pipeline "${name}".`);
	const pipeline = await getPipeline(accountId, name);
	metrics.sendMetricsEvent("show pipeline", {
		sendMetrics: config.send_metrics,
	});

	logger.log(JSON.stringify(pipeline, null, 2));
}
