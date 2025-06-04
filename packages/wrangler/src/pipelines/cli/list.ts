import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { listPipelines } from "../client";

export const pipelinesListCommand = createCommand({
	metadata: {
		description: "List all pipelines",
		owner: "Product: Pipelines",
		status: "open-beta",
	},

	async handler(_, { config }) {
		const accountId = await requireAuth(config);

		// TODO: we should show bindings & transforms if they exist for given ids
		const list = await listPipelines(config, accountId);

		logger.table(
			list.map((pipeline) => ({
				name: pipeline.name,
				id: pipeline.id,
				endpoint: pipeline.endpoint,
			}))
		);
	},
});
