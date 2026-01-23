import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import { listStreams } from "../../client";

export const pipelinesStreamsListCommand = createCommand({
	metadata: {
		description: "List all streams",
		owner: "Product: Pipelines",
		status: "open beta",
		logArgs: true,
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
			describe: "Number of streams per page",
			type: "number",
			default: 20,
		},
		"pipeline-id": {
			describe: "Filter streams by pipeline ID",
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

		const streams = await listStreams(config, {
			page: args.page,
			per_page: args.perPage,
			pipeline_id: args.pipelineId,
		});

		if (args.json) {
			logger.json(streams);
			return;
		}

		if (!streams || streams.length === 0) {
			logger.log("No streams found.");
			return;
		}

		logger.table(
			streams.map((stream) => ({
				Name: stream.name,
				ID: stream.id,
				HTTP: stream.http.enabled
					? stream.http.authentication
						? "Yes (authenticated)"
						: "Yes (unauthenticated)"
					: "No",
				Created: new Date(stream.created_at).toLocaleDateString(),
			}))
		);
	},
});
