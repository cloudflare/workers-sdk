import { fetchResult } from "../../../cfetch";
import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import type { Instance } from "../../types";

export const workflowsInstancesPauseCommand = createCommand({
	metadata: {
		description: "Pause a workflow instance",
		owner: "Product: Workflows",
		status: "open-beta",
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
				"ID of the instance - instead of an UUID you can type 'latest' to get the latest instance and pause it",
			type: "string",
			demandOption: true,
		},
	},

	async handler(args, { config }) {
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
					`There are no deployed instances in workflow "${args.name}"`
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
				body: JSON.stringify({ status: "pause" }),
			}
		);

		logger.info(
			`⏸️ The instance "${id}" from ${args.name} was paused successfully`
		);
	},
});
