import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import {
	getLocalInstanceIdFromArgs,
	localWorkflowArgs,
	updateLocalInstanceStatus,
} from "../../local";
import { getInstanceIdFromArgs, updateInstanceStatus } from "../../utils";

export const workflowsInstancesRestartCommand = createCommand({
	metadata: {
		description: "Restart a workflow instance",
		owner: "Product: Workflows",
		status: "stable",
	},
	positionalArgs: ["name", "id"],
	args: {
		...localWorkflowArgs,
		name: {
			describe: "Name of the workflow",
			type: "string",
			demandOption: true,
		},
		id: {
			describe:
				"ID of the instance - instead of an UUID you can type 'latest' to get the latest instance and describe it",
			type: "string",
			demandOption: true,
		},
	},

	async handler(args, { config }) {
		let id: string;

		if (args.local) {
			id = await getLocalInstanceIdFromArgs(args.port, args);
			await updateLocalInstanceStatus(args.port, args.name, id, "restart");
		} else {
			const accountId = await requireAuth(config);
			id = await getInstanceIdFromArgs(accountId, args, config);
			await updateInstanceStatus(config, accountId, args.name, id, "restart");
		}

		logger.info(
			`🥷 The instance "${id}" from ${args.name} was restarted successfully`
		);
	},
});
