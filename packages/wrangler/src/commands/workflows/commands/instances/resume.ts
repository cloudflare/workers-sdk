import { createCommand } from "../../../../core/create-command";
import { logger } from "../../../../logger";
import { requireAuth } from "../../../../user";
import { getInstanceIdFromArgs, updateInstanceStatus } from "../../utils";

export const workflowsInstancesResumeCommand = createCommand({
	metadata: {
		description: "Resume a workflow instance",
		owner: "Product: Workflows",
		status: "stable",
	},

	positionalArgs: ["name", "id"],
	args: {
		name: {
			describe: "Name of the workflow",
			type: "string",
			demandOption: true,
		},
		id: {
			describe:
				"ID of the instance - instead of an UUID you can type 'latest' to get the latest instance and resume it",
			type: "string",
			demandOption: true,
		},
	},

	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		const id = await getInstanceIdFromArgs(accountId, args, config);

		await updateInstanceStatus(config, accountId, args.name, id, "resume");

		logger.info(
			`🔄 The instance "${id}" from ${args.name} was resumed successfully`
		);
	},
});
