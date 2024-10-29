import { fetchResult } from "../../cfetch";
import { defineCommand } from "../../core";
import { logger } from "../../logger";
import { requireAuth } from "../../user";

defineCommand({
	command: "wrangler workflows delete",
	metadata: {
		description:
			"Delete workflow - when deleting a workflow, it will also delete it's own instances",
		owner: "Product: Workflows",
		status: "open-beta",
	},

	args: {
		name: {
			describe: "Name of the workflow",
			type: "string",
			demandOption: true,
		},
	},
	positionalArgs: ["name"],

	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		await fetchResult(`/accounts/${accountId}/workflows/${args.name}`, {
			method: "DELETE",
		});

		logger.info(`Workflow "${args.name}" was successfully removed`);
	},
});
