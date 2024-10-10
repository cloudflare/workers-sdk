import { fetchResult } from "../../../cfetch";
import { readConfig } from "../../../config";
import { logger } from "../../../logger";
import { printWranglerBanner } from "../../../update-check";
import { requireAuth } from "../../../user";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../../yargs-types";
import type { Instance, InstanceChangeStatusType } from "../../types";

export const changeStatusGenericOptions = (args: CommonYargsArgv) => {
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
	typeof changeStatusGenericOptions
>;

export const changeStatusBaseHandler = (
	changeStatusType: InstanceChangeStatusType
) => {
	const handler = async (args: HandlerOptions) => {
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
			`/accounts/${accountId}/workflows/${args.name}/instances/${id}/status`,
			{
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ status: changeStatusType }),
			}
		);

		switch (changeStatusType) {
			case "pause":
				logger.info(
					`⏸️ The instance "${id}" from ${args.name} was paused successfully.`
				);
				break;
			case "resume":
				logger.info(
					`▶️ The instance "${id}" from ${args.name} was resumed successfully.`
				);
				break;
			case "terminate":
				logger.info(
					`🥷 The instance "${id}" from ${args.name} was terminated successfully.`
				);
				break;
		}
	};

	return handler;
};
