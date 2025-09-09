import { createCommand } from "../../core/create-command";
import { confirm } from "../../dialogs";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { deletePipeline, getPipeline } from "../client";
import { deleteLegacyPipeline } from "./legacy-helpers";

export const pipelinesDeleteCommand = createCommand({
	metadata: {
		description: "Delete a pipeline",
		owner: "Product: Pipelines",
		status: "open-beta",
	},
	args: {
		pipeline: {
			type: "string",
			describe: "The ID of the pipeline to delete (or name for --legacy)",
			demandOption: true,
		},
		legacy: {
			type: "boolean",
			describe: "Use the legacy Pipelines API",
			default: false,
		},
		force: {
			describe: "Skip confirmation",
			type: "boolean",
			alias: "y",
			default: false,
		},
	},
	positionalArgs: ["pipeline"],
	async handler(args, { config }) {
		const accountId = await requireAuth(config);
		const pipelineId = args.pipeline;

		// Handle legacy API if flag is provided
		if (args.legacy) {
			return await deleteLegacyPipeline(
				config,
				accountId,
				pipelineId,
				args.force
			);
		}

		const pipeline = await getPipeline(config, pipelineId);

		if (!args.force) {
			const confirmedDelete = await confirm(
				`Are you sure you want to delete the pipeline '${pipeline.name}' (${pipelineId})?`
			);
			if (!confirmedDelete) {
				logger.log("Delete cancelled.");
				return;
			}
		}

		await deletePipeline(config, pipelineId);

		logger.log(
			`✨ Successfully deleted pipeline '${pipeline.name}' with id '${pipeline.id}'.`
		);
	},
});
