import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { listPipelines } from "../client";
import { listLegacyPipelines } from "./legacy-helpers";

export const pipelinesListCommand = createCommand({
	metadata: {
		description: "List all pipelines",
		owner: "Product: Pipelines",
		status: "open-beta",
	},
	args: {
		legacy: {
			type: "boolean",
			describe: "Use the legacy Pipelines API",
			default: false,
		},
		page: {
			describe: "Page number for pagination",
			type: "number",
			default: 1,
		},
		"per-page": {
			describe: "Number of pipelines per page",
			type: "number",
			default: 20,
		},
		json: {
			describe: "Output in JSON format",
			type: "boolean",
			default: false,
		},
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		// Handle legacy API if flag is provided
		if (args.legacy) {
			return await listLegacyPipelines(config, accountId);
		}

		const pipelines = await listPipelines(config, {
			page: args.page,
			per_page: args.perPage,
		});

		if (args.json) {
			logger.log(JSON.stringify(pipelines, null, 2));
			return;
		}

		if (!pipelines || pipelines.length === 0) {
			logger.log("No pipelines found.");
			return;
		}

		logger.table(
			pipelines.map((pipeline) => ({
				Name: pipeline.name,
				ID: pipeline.id,
				Created: new Date(pipeline.created_at).toLocaleDateString(),
				Modified: new Date(pipeline.modified_at).toLocaleDateString(),
			}))
		);
	},
});
