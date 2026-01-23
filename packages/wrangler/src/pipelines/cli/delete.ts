import { APIError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import { confirm } from "../../dialogs";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { deletePipeline, getPipeline } from "../client";
import { tryDeleteLegacyPipeline } from "./legacy-helpers";

export const pipelinesDeleteCommand = createCommand({
	metadata: {
		description: "Delete a pipeline",
		owner: "Product: Pipelines",
		status: "open beta",
		logArgs: true,
	},
	args: {
		pipeline: {
			type: "string",
			describe: "The ID or name of the pipeline to delete",
			demandOption: true,
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

		try {
			const pipeline = await getPipeline(config, pipelineId);

			if (!args.force) {
				const confirmedDelete = await confirm(
					`Are you sure you want to delete the pipeline '${pipeline.name}' (${pipelineId})?`,
					{ fallbackValue: false }
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
		} catch (error) {
			if (
				error instanceof APIError &&
				(error.code === 1000 || error.code === 2)
			) {
				const deletedFromLegacy = await tryDeleteLegacyPipeline(
					config,
					accountId,
					pipelineId,
					args.force
				);

				if (deletedFromLegacy) {
					return;
				}
			}
			throw error;
		}
	},
});
