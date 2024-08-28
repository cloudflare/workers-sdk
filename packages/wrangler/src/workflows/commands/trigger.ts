import { fetchResult } from "../../cfetch";
import { readConfig } from "../../config";
import { logger } from "../../logger";
import { printWranglerBanner } from "../../update-check";
import { requireAuth } from "../../user";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";
import type { InstanceWithoutDates } from "../types";

export const workflowTriggerOptions = (args: CommonYargsArgv) => {
	return args
		.positional("name", {
			describe: "Name of the workflow",
			type: "string",
			demandOption: true,
		})
		.positional("params", {
			describe: "Params for the workflow instance, encoded as a JSON string",
			type: "string",
			default: "",
		});
};

type HandlerOptions = StrictYargsOptionsToInterface<
	typeof workflowTriggerOptions
>;
export const workflowTriggerHandler = async (args: HandlerOptions) => {
	await printWranglerBanner();

	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);

	if (args.params.length != 0) {
		try {
			JSON.parse(args.params);
		} catch (e) {
			logger.error(
				`Error while parsing instance parameters: "${args.params}" with ${e}' `
			);
			return;
		}
	}

	const response = await fetchResult<InstanceWithoutDates>(
		`/accounts/${accountId}/workflows/${args.name}/instances`,
		{
			method: "POST",
			body: args.params.length != 0 ? args.params : undefined,
		}
	);

	logger.info(
		`🚀 Workflow instance "${response.id}" has been queued successfully`
	);
};
