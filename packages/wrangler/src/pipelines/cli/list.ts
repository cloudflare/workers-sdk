import { readConfig } from "../../config";
import { logger } from "../../logger";
import * as metrics from "../../metrics";
import { requireAuth } from "../../user";
import { listPipelines } from "../client";
import type { CommonYargsOptions } from "../../yargs-types";
import type { ArgumentsCamelCase } from "yargs";

export async function listPipelinesHandler(
	args: ArgumentsCamelCase<CommonYargsOptions>
) {
	const config = readConfig(args);
	const accountId = await requireAuth(config);

	// TODO: we should show bindings & transforms if they exist for given ids
	const list = await listPipelines(accountId);
	metrics.sendMetricsEvent("list pipelines", {
		sendMetrics: config.send_metrics,
	});

	logger.table(
		list.map((pipeline) => ({
			name: pipeline.name,
			id: pipeline.id,
			endpoint: pipeline.endpoint,
		}))
	);
}
