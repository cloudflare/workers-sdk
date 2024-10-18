import { fetchResult } from "../../cfetch";
import { defineCommand } from "../../core";
import { requireAuth } from "../../user";
import type { InstanceWithoutDates } from "../types";

defineCommand({
	command: "wrangler workflows trigger",

	metadata: {
		description:
			"Trigger a workflow, creating a new instance. Can optionally take a JSON string to pass a parameter into the workflow instance.",
		owner: "Product: Workflows",
		status: "open-beta",
	},

	args: {
		name: {
			describe: "Name of the workflow",
			type: "string",
			demandOption: true,
		},
		params: {
			describe: "Params for the workflow instance, encoded as a JSON string",
			type: "string",
			default: "",
		},
	},
	positionalArgs: ["name", "params"],

	async handler(args, { config, logger }) {
		const accountId = await requireAuth(config);

		if (args.params.length != 0) {
			try {
				JSON.parse(args.params);
			} catch (e) {
				logger.error(
					`Error while parsing instance parameters: "${args.params}" with ${e}' `
				);
				return;
			}
		}

		const response = await fetchResult<InstanceWithoutDates>(
			`/accounts/${accountId}/workflows/${args.name}/instances`,
			{
				method: "POST",
				body: args.params.length != 0 ? args.params : undefined,
			}
		);

		logger.info(
			`🚀 Workflow instance "${response.id}" has been queued successfully`
		);
	},
});
