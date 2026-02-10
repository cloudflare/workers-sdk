import { UserError } from "@cloudflare/workers-utils";
import { fetchResult } from "../../../cfetch";
import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import { getInstanceIdFromArgs } from "../../utils";

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

		const id = await getInstanceIdFromArgs(accountId, args, config);

		let payload;
		try {
			payload = JSON.parse(args.payload);
		} catch (e) {
			throw new UserError(
				`Error while parsing event payload: "${args.payload}" with ${e}' `
			);
		}

		await fetchResult(
			config,
			`/accounts/${accountId}/workflows/${args.name}/instances/${id}/events/${args.type}`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: args.payload,
			}
		);

		const payloadInfo =
			Object.keys(payload).length > 0 ? ` and payload "${args.payload}"` : "";
		logger.info(
			`📤 The event with type "${args.type}"${payloadInfo} was sent to the instance "${id}" from ${args.name}`
		);
	},
});
