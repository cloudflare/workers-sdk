import { readConfig } from "../../config";
import { logger } from "../../logger";
import * as metrics from "../../metrics";
import { requireAuth } from "../../user";
import { printWranglerBanner } from "../../wrangler-banner";
import { deletePipeline } from "../client";
import { validateName } from "../validate";
import type {
	CommonYargsOptions,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";
import type { Argv } from "yargs";

export function addDeleteOptions(yargs: Argv<CommonYargsOptions>) {
	return yargs.positional("pipeline", {
		type: "string",
		describe: "The name of the Pipeline to show",
		demandOption: true,
	});
}

export async function deletePipelineHandler(
	args: StrictYargsOptionsToInterface<typeof addDeleteOptions>
) {
	await printWranglerBanner();
	const config = readConfig(args);
	const accountId = await requireAuth(config);
	const name = args.pipeline;

	validateName("pipeline name", name);

	logger.log(`Deleting Pipeline ${name}.`);
	await deletePipeline(accountId, name);
	logger.log(`Deleted Pipeline ${name}.`);
	metrics.sendMetricsEvent("delete pipeline", {
		sendMetrics: config.send_metrics,
	});
}
