import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import formatLabelledValues from "../../../utils/render-labelled-values";
import { jsonWorkflowArgs } from "../../utils";
import {
	concurrencyKeyArg,
	concurrencyKeyMetadata,
	concurrencyLocalArgs,
	getConcurrencyKeysClient,
} from "./shared";

export const workflowsConcurrencyGetCommand = createCommand({
	metadata: {
		...concurrencyKeyMetadata,
		description:
			"Show a concurrency key and the Workflows whose latest version declares it",
	},
	args: {
		...concurrencyLocalArgs,
		...jsonWorkflowArgs,
		key: concurrencyKeyArg,
	},
	positionalArgs: ["key"],
	behaviour: {
		printBanner: (args) => !args.json,
	},
	async handler(args, { config }) {
		const client = await getConcurrencyKeysClient(config, args);
		const key = await client.get(await client.resolveId(args.key));

		if (args.json) {
			logger.json(key);
			return;
		}
		logger.log(
			formatLabelledValues({
				Name: key.name,
				ID: key.id,
				Limit: String(key.limit),
				...(key.usage === undefined
					? {}
					: {
							Holding: String(key.usage.holding),
							Waiting: String(key.usage.waiting),
						}),
				Created: new Date(key.created_on).toLocaleString(),
			})
		);
		// Local Workflows cannot declare the keys they use, so there is nothing to list.
		// Showing "No Workflow declares this key" there would read as a problem to fix.
		if (client.local) {
			return;
		}
		if (key.referencing_workflows.length === 0) {
			logger.log("\nNo Workflow declares this key.");
			return;
		}
		logger.log("\nDeclared by:");
		logger.table(
			key.referencing_workflows.map((reference) => ({
				Workflow: reference.workflow_name,
				Version: reference.version_id,
			}))
		);
	},
});
