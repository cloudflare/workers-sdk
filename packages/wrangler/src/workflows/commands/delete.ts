import { fetchResult } from "../../cfetch";
import { readConfig } from "../../config";
import { logger } from "../../logger";
import { printWranglerBanner } from "../../update-check";
import { requireAuth } from "../../user";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";

export const workflowDeleteOptions = (args: CommonYargsArgv) => {
	return args.positional("name", {
		describe: "Name of the workflow",
		type: "string",
		demandOption: true,
	});
};

type HandlerOptions = StrictYargsOptionsToInterface<
	typeof workflowDeleteOptions
>;
export const workflowDeleteHandler = async (args: HandlerOptions) => {
	await printWranglerBanner();

	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);

	await fetchResult(`/accounts/${accountId}/workflows/${args.name}`, {
		method: "DELETE",
	});

	logger.info(`Workflow "${args.name}" was successfully removed`);
};
