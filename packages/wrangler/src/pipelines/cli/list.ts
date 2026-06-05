import { red } from "@cloudflare/cli-shared-helpers/colors";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { listPipelines } from "../client";
import { tryListLegacyPipelines } from "./legacy-helpers";

export const pipelinesListCommand = createCommand({
	metadata: {
		description: "List all pipelines",
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

		const [newPipelines, legacyPipelines] = await Promise.all([
			listPipelines(config, {
				page: args.page,
				per_page: args.perPage,
			}),
			tryListLegacyPipelines(config, accountId),
		]);

		if (args.json) {
			const hasLegacyPipelines = legacyPipelines && legacyPipelines.length > 0;
			const result = hasLegacyPipelines
				? {
						pipelines: newPipelines || [],
						legacyPipelines: legacyPipelines,
					}
				: newPipelines || [];
			logger.json(result);
			return;
		}

		const hasLegacyPipelines = legacyPipelines && legacyPipelines.length > 0;
		const hasNewPipelines = newPipelines && newPipelines.length > 0;

		if (!hasNewPipelines && !hasLegacyPipelines) {
			logger.log("No pipelines found.");
			return;
		}

		if (hasLegacyPipelines) {
			const tableData = [
				...(newPipelines || []).map((pipeline) => ({
					Name: pipeline.name,
					ID: pipeline.id,
					Created: new Date(pipeline.created_at).toLocaleDateString(),
					Modified: new Date(pipeline.modified_at).toLocaleDateString(),
					Status: pipeline.status,
					Type: "",
				})),
				...legacyPipelines.map((pipeline) => ({
					Name: pipeline.name,
					ID: pipeline.id,
					Created: "N/A",
					Modified: "N/A",
					Status: "N/A",
					Type: "Legacy",
				})),
			];
			logger.table(tableData);
		} else {
			const tableData = (newPipelines || []).map((pipeline) => ({
				Name: pipeline.name,
				ID: pipeline.id,
				Created: new Date(pipeline.created_at).toLocaleDateString(),
				Modified: new Date(pipeline.modified_at).toLocaleDateString(),
				Status: pipeline.status,
			}));
			logger.table(tableData);
		}

		const failedPipelines = (newPipelines || []).filter(
			(pipeline) => pipeline.status === "failed"
		);
		if (failedPipelines.length > 0) {
			logger.log(
				`\n${failedPipelines.length} pipeline${failedPipelines.length === 1 ? " is" : "s are"} in a failed state. Run 'wrangler pipelines get <pipeline>' for details:`
			);
			for (const pipeline of failedPipelines) {
				logger.log(
					red(
						`  ✘ ${pipeline.name}: ${pipeline.failure_reason ?? "Unknown failure"}\n`
					)
				);
			}
		}

		if (hasLegacyPipelines) {
			logger.warn(
				"⚠️  You have legacy pipelines. Consider creating new pipelines by running 'wrangler pipelines setup'."
			);
		}
	},
});
