import { logRaw } from "@cloudflare/cli";
import { fetchListResult } from "./cfetch";
import { createCommand } from "./core/create-command";
import { logger } from "./logger";
import * as metrics from "./metrics";
import { requireAuth } from "./user";
import formatLabelledValues from "./utils/render-labelled-values";
import type { ComplianceConfig } from "./environment-variables/misc-variables";

interface WorkerScript {
	id: string;
	created_on: string;
	modified_on: string;
	deployment_id?: string;
	logpush?: boolean;
	etag?: string;
	handlers?: string[];
	last_deployed_from?: string;
}

async function listWorkers(
	complianceConfig: ComplianceConfig,
	accountId: string
): Promise<WorkerScript[]> {
	return await fetchListResult<WorkerScript>(
		complianceConfig,
		`/accounts/${accountId}/workers/scripts`
	);
}

export const listCommand = createCommand({
	metadata: {
		description: "List all Workers in your account",
		owner: "Workers: Deploy and Config",
		status: "stable",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		json: {
			describe: "Display output as clean JSON",
			type: "boolean",
			default: false,
		},
	},
	handler: async function listHandler(args, { config }) {
		metrics.sendMetricsEvent(
			"list workers",
			{ json: args.json },
			{
				sendMetrics: config.send_metrics,
			}
		);

		const accountId = await requireAuth(config);
		const workers = await listWorkers(config, accountId);

		if (args.json) {
			logRaw(JSON.stringify(workers, null, 2));
			return;
		}

		if (workers.length === 0) {
			logger.log("No Workers found in your account.");
			return;
		}

		logger.log(
			`Found ${workers.length} Worker${workers.length === 1 ? "" : "s"}:\n`
		);

		for (const worker of workers) {
			const formattedWorker = formatLabelledValues({
				"Worker Name": worker.id,
				Created: new Date(worker.created_on).toISOString(),
				Modified: new Date(worker.modified_on).toISOString(),
				Handlers: worker.handlers?.join(", ") || "None",
				"Last Deployed From": worker.last_deployed_from || "Unknown",
			});

			logRaw(formattedWorker);
			logRaw("");
		}
	},
});
