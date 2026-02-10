import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import { listSinks } from "../../client";

export const pipelinesSinksListCommand = createCommand({
	metadata: {
		description: "List all sinks",
		owner: "Product: Pipelines",
		status: "open beta",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		page: {
			describe: "Page number for pagination",
			type: "number",
			default: 1,
		},
		"per-page": {
			describe: "Number of sinks per page",
			type: "number",
			default: 20,
		},
		"pipeline-id": {
			describe: "Filter sinks by pipeline ID",
			type: "string",
		},
		json: {
			describe: "Output in JSON format",
			type: "boolean",
			default: false,
		},
	},
	async handler(args, { config }) {
		await requireAuth(config);

		const sinks = await listSinks(config, {
			page: args.page,
			per_page: args.perPage,
			pipeline_id: args.pipelineId,
		});

		if (args.json) {
			logger.log(sinks);
			return;
		}

		if (!sinks || sinks.length === 0) {
			logger.log("No sinks found.");
			return;
		}

		logger.table(
			sinks.map((sink) => ({
				Name: sink.name,
				ID: sink.id,
				Type: sink.type === "r2" ? "R2" : "R2 Data Catalog",
				Destination:
					sink.type === "r2"
						? sink.config.bucket
						: `${sink.config.namespace}.${sink.config.table_name}`,
				Created: sink.created_at
					? new Date(sink.created_at).toLocaleDateString()
					: "N/A",
			}))
		);
	},
});
