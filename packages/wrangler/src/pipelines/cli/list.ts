import { readConfig } from "../../config";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { printWranglerBanner } from "../../wrangler-banner";
import { listPipelines } from "../client";
import type { CommonYargsOptions } from "../../yargs-types";
import type { ArgumentsCamelCase } from "yargs";

export async function listPipelinesHandler(
	args: ArgumentsCamelCase<CommonYargsOptions>
) {
	await printWranglerBanner();
	const config = readConfig(args);
	const accountId = await requireAuth(config);

	// TODO: we should show bindings & transforms if they exist for given ids
	const list = await listPipelines(accountId);

	logger.table(
		list.map((pipeline) => ({
			name: pipeline.name,
			id: pipeline.id,
			endpoint: pipeline.endpoint,
		}))
	);
}
