import { fetchResult } from "../../../cfetch";
import { readConfig } from "../../../config";
import { logger } from "../../../logger";
import { printWranglerBanner } from "../../../update-check";
import { requireAuth } from "../../../user";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../../yargs-types";
import type { Instance } from "../../types";

export const instancesTerminateOptions = (args: CommonYargsArgv) => {
	return args
		.positional("name", {
			describe: "Name of the workflow",
			type: "string",
			demandOption: true,
		})
		.positional("id", {
			describe:
				"ID of the instance - instead of an UUID you can type 'latest' to get the latest instance and describe it",
			type: "string",
			demandOption: true,
		});
};

type HandlerOptions = StrictYargsOptionsToInterface<
	typeof instancesTerminateOptions
>;

export const instancesTerminateHandler = async (args: HandlerOptions) => {
	await printWranglerBanner();

	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);

	let id = args.id;

	if (id == "latest") {
		const instances = (
			await fetchResult<Instance[]>(
				`/accounts/${accountId}/workflows/${args.name}/instances`
			)
		).sort((a, b) => b.created_on.localeCompare(a.created_on));

		if (instances.length == 0) {
			logger.error(
				`There are no deployed instances in workflow "${args.name}".`
			);
			return;
		}

		id = instances[0].id;
	}

	await fetchResult(
		`/accounts/${accountId}/workflows/${args.name}/instances/${id}`,
		{
			method: "DELETE",
		}
	);

	logger.info(
		`🥷 The instance "${id}" from ${args.name} was terminated successfully.`
	);
};
