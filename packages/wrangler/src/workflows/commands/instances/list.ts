import { printWranglerBanner } from "../../..";
import { fetchResult } from "../../../cfetch";
import { readConfig } from "../../../config";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import { emojifyInstanceStatus } from "../../utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../../yargs-types";
import type { Instance } from "../../types";

export const instancesListOptions = (args: CommonYargsArgv) => {
	return args
		.positional("name", {
			describe: "Name of the workflow",
			type: "string",
			demandOption: true,
		})
		.option("reverse", {
			describe: "Reverse order of the instances table",
			type: "boolean",
			default: false,
		});
};

type HandlerOptions = StrictYargsOptionsToInterface<
	typeof instancesListOptions
>;
export const instancesListHandler = async (args: HandlerOptions) => {
	await printWranglerBanner();

	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);

	const instances = await fetchResult<Instance[]>(
		`/accounts/${accountId}/workflows/${args.name}/instances`
	);

	if (instances.length === 0) {
		logger.warn(
			`There are no instances in workflow "${args.name}". You can trigger it with "wrangler workflows trigger ${args.name}"`
		);
		return;
	}

	// TODO(lduarte): can we improve this message once pagination is deployed
	logger.info(
		`Showing last ${instances.length} instance${instances.length > 1 ? "s" : ""}:`
	);

	const prettierInstances = instances
		.sort((a, b) =>
			args.reverse
				? a.modified_on.localeCompare(b.modified_on)
				: b.modified_on.localeCompare(a.modified_on)
		)
		.map((instance) => ({
			Id: instance.id,
			Version: instance.version_id,
			Created: new Date(instance.created_on).toLocaleString(),
			Modified: new Date(instance.modified_on).toLocaleString(),
			Status: emojifyInstanceStatus(instance.status),
		}));

	logger.table(prettierInstances);
};
