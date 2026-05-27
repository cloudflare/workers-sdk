import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import { confirm } from "../../dialogs";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { deletePipeline } from "../client";
import { tryDeleteLegacyPipeline } from "./legacy-helpers";
import { resolvePipeline } from "./resolve";

export const pipelinesDeleteCommand = createCommand({
	metadata: {
		description: "Delete a pipeline",
		owner: "Product: Pipelines",
		status: "open beta",
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

		const pipeline = await resolvePipeline(config, pipelineId);

		if (!pipeline) {
			const deletedFromLegacy = await tryDeleteLegacyPipeline(
				config,
				accountId,
				pipelineId,
				args.force
			);

			if (deletedFromLegacy) {
				return;
			}

			throw new UserError(`Pipeline "${pipelineId}" not found.`, {
				telemetryMessage: "pipelines pipeline resolve not found",
			});
		}

		if (!args.force) {
			const confirmedDelete = await confirm(
				`Are you sure you want to delete the pipeline '${pipeline.name}' (${pipeline.id})?`,
				{ fallbackValue: false }
			);
			if (!confirmedDelete) {
				logger.log("Delete cancelled.");
				return;
			}
		}

		await deletePipeline(config, pipeline.id);

		logger.log(
			`✨ Successfully deleted pipeline '${pipeline.name}' with id '${pipeline.id}'.`
		);
	},
});
