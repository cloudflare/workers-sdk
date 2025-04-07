import { readConfig } from "../../config";
import { logger } from "../../logger";
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
		describe: "The name of the pipeline to delete",
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

	logger.log(`Deleting pipeline ${name}.`);
	await deletePipeline(accountId, name);

	logger.log(`Deleted pipeline ${name}.`);
}
