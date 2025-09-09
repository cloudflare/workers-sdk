import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import formatLabelledValues from "../../utils/render-labelled-values";
import { getPipeline } from "../client";
import { getLegacyPipeline } from "./legacy-helpers";

export const pipelinesGetCommand = createCommand({
	metadata: {
		description: "Get details about a specific pipeline",
		owner: "Product: Pipelines",
		status: "open-beta",
	},
	args: {
		pipeline: {
			type: "string",
			describe: "The ID of the pipeline to retrieve (or name for --legacy)",
			demandOption: true,
		},
		format: {
			choices: ["pretty", "json"],
			describe: "The output format for pipeline",
			default: "pretty",
		},
		legacy: {
			type: "boolean",
			describe: "Use the legacy Pipelines API",
			default: false,
		},
	},
	positionalArgs: ["pipeline"],
	async handler(args, { config }) {
		const accountId = await requireAuth(config);
		const pipelineId = args.pipeline;

		// Handle legacy API if flag is provided
		if (args.legacy) {
			return await getLegacyPipeline(
				config,
				accountId,
				pipelineId,
				args.format as "pretty" | "json"
			);
		}

		const pipeline = await getPipeline(config, pipelineId);

		if (args.format === "json") {
			logger.log(JSON.stringify(pipeline, null, 2));
			return;
		}

		const general: Record<string, string> = {
			ID: pipeline.id,
			Name: pipeline.name,
			"Created At": new Date(pipeline.created_at).toLocaleString(),
			"Modified At": new Date(pipeline.modified_at).toLocaleString(),
		};

		logger.log("General:");
		logger.log(formatLabelledValues(general, { indentationCount: 2 }));

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
