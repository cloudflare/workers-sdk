import { bold, red } from "@cloudflare/cli-shared-helpers/colors";
import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import formatLabelledValues from "../../utils/render-labelled-values";
import { tryGetLegacyPipeline } from "./legacy-helpers";
import { resolvePipeline } from "./resolve";

export const pipelinesGetCommand = createCommand({
	metadata: {
		description: "Get details about a specific pipeline",
		owner: "Product: Pipelines",
		status: "open beta",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		pipeline: {
			type: "string",
			describe: "The ID or name of the pipeline to retrieve",
			demandOption: true,
		},
		json: {
			describe: "Output in JSON format",
			type: "boolean",
			default: false,
		},
	},
	positionalArgs: ["pipeline"],
	async handler(args, { config }) {
		const accountId = await requireAuth(config);
		const pipelineId = args.pipeline;

		const pipeline = await resolvePipeline(config, pipelineId);

		if (!pipeline) {
			const foundInLegacy = await tryGetLegacyPipeline(
				config,
				accountId,
				pipelineId,
				args.json ? "json" : "pretty"
			);

			if (foundInLegacy) {
				return;
			}

			throw new UserError(`Pipeline "${pipelineId}" not found.`, {
				telemetryMessage: "pipelines pipeline resolve not found",
			});
		}

		if (args.json) {
			logger.json(pipeline);
			return;
		}

		const general: Record<string, string> = {
			ID: pipeline.id,
			Name: pipeline.name,
			Status: pipeline.status,
			"Created At": new Date(pipeline.created_at).toLocaleString(),
			"Modified At": new Date(pipeline.modified_at).toLocaleString(),
		};

		logger.log("General:");
		logger.log(formatLabelledValues(general, { indentationCount: 2 }));

		if (pipeline.status === "failed") {
			logger.log(`\n${bold(red("✘ This pipeline is in a failed state."))}`);
			logger.log(
				red(`  Reason: ${pipeline.failure_reason ?? "Unknown failure"}`)
			);
		}

		logger.log("\nPipeline SQL:");
		logger.log(pipeline.sql);

		if (pipeline.tables && pipeline.tables.length > 0) {
			const streams = pipeline.tables.filter(
				(table) => table.type === "stream"
			);
			const sinks = pipeline.tables.filter((table) => table.type === "sink");

			if (streams.length > 0) {
				logger.log("\nConnected Streams:");
				logger.table(
					streams.map((stream) => ({
						Name: stream.name,
						ID: stream.id,
					}))
				);
			}

			if (sinks.length > 0) {
				logger.log("\nConnected Sinks:");
				logger.table(
					sinks.map((sink) => ({
						Name: sink.name,
						ID: sink.id,
					}))
				);
			}
		} else {
			logger.log("\nConnected Streams: None");
			logger.log("Connected Sinks: None");
		}
	},
});
