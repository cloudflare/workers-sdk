import { fetchResult } from "../../../cfetch";
import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import type { Instance } from "../../types";

export const workflowsInstancesSendEventCommand = createCommand({
	metadata: {
		description: "Send an event to a workflow instance",
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
				"ID of the instance - instead of an UUID you can type 'latest' to get the latest instance and send an event to it",
			type: "string",
			demandOption: true,
		},
		type: {
			describe: "Type of the workflow event",
			type: "string",
			demandOption: true,
		},
		payload: {
			describe:
				'JSON string for the workflow event (e.g., \'{"key": "value"}\')',
			type: "string",
			demandOption: false,
			default: "{}",
		},
	},

	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		let id = args.id;

		if (id == "latest") {
			const instances = (
				await fetchResult<Instance[]>(
					config,
					`/accounts/${accountId}/workflows/${args.name}/instances/`
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

		const payload = JSON.parse(args.payload);

		await fetchResult(
			config,
			`/accounts/${accountId}/workflows/${args.name}/instances/${id}/events/${args.type}`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			}
		);

		logger.info(
			`📤 The event with type "${args.type}" and payload "${args.payload}" was sent to the instance "${id}" from ${args.name}`
		);
	},
});
