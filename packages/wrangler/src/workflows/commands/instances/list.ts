import { printWranglerBanner } from "../../..";
import { fetchResult } from "../../../cfetch";
import { readConfig } from "../../../config";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import { emojifyInstanceStatus, validateStatus } from "../../utils";
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
		})
		.option("status", {
			describe:
				"Filters list by instance status (can be one of: queued, running, paused, errored, terminated, complete)",
			type: "string",
		})
		.option("page", {
			describe:
				'Show a sepecific page from the listing, can configure page size using "per-page".',
			type: "number",
			default: 1,
		})
		.option("per-page", {
			describe: "Configure the maximum number of instances to show per page.",
			type: "number",
		});
};

type HandlerOptions = StrictYargsOptionsToInterface<
	typeof instancesListOptions
>;
export const instancesListHandler = async (args: HandlerOptions) => {
	await printWranglerBanner();

	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);

	const URLParams = new URLSearchParams();

	if (args.status !== undefined) {
		const validatedStatus = validateStatus(args.status);
		URLParams.set("status", validatedStatus);
	}
	if (args.perPage !== undefined) {
		URLParams.set("per_page", args.perPage.toString());
	}

	URLParams.set("page", args.page.toString());

	const instances = await fetchResult<Instance[]>(
		`/accounts/${accountId}/workflows/${args.name}/instances`,
		undefined,
		URLParams
	);

	if (instances.length === 0) {
		logger.warn(
			`There are no instances in workflow "${args.name}". You can trigger it with "wrangler workflows trigger ${args.name}"`
		);
		return;
	}

	logger.info(
		`Showing ${instances.length} instance${instances.length > 1 ? "s" : ""} from page ${args.page}:`
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
