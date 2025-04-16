import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { deletePipeline } from "../client";
import { validateName } from "../validate";

export const pipelinesDeleteCommand = createCommand({
	metadata: {
		description: "Delete a pipeline",
		owner: "Product: Pipelines",
		status: "open-beta",
	},
	args: {
		pipeline: {
			type: "string",
			describe: "The name of the pipeline to delete",
			demandOption: true,
		},
	},
	positionalArgs: ["pipeline"],
	async handler(args, { config }) {
		const accountId = await requireAuth(config);
		const name = args.pipeline;

		validateName("pipeline name", name);

		logger.log(`Deleting pipeline ${name}.`);
		await deletePipeline(accountId, name);

		logger.log(`Deleted pipeline ${name}.`);
	},
});
