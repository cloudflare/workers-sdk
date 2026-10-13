import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import formatLabelledValues from "../../../utils/render-labelled-values";
import { jsonWorkflowArgs } from "../../utils";
import {
	concurrencyKeyArg,
	concurrencyKeyMetadata,
	getConcurrencyKey,
	resolveConcurrencyKeyId,
} from "./shared";
import type { ConcurrencyKeyDetail } from "../../types";

export const workflowsConcurrencyGetCommand = createCommand({
	metadata: {
		...concurrencyKeyMetadata,
		description:
			"Show a concurrency key and the Workflows whose latest version declares it",
	},
	args: {
		...jsonWorkflowArgs,
		key: concurrencyKeyArg,
	},
	positionalArgs: ["key"],
	behaviour: {
		printBanner: (args) => !args.json,
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);
		const keyId = await resolveConcurrencyKeyId(config, accountId, args.key);
		const key = await getConcurrencyKey<ConcurrencyKeyDetail>(
			config,
			accountId,
			keyId
		);

		if (args.json) {
			logger.json(key);
			return;
		}
		logger.log(
			formatLabelledValues({
				Name: key.name,
				ID: key.id,
				Limit: String(key.limit),
				Created: new Date(key.created_on).toLocaleString(),
			})
		);
		if (key.referencing_workflows.length === 0) {
			logger.log("\nNo Workflow declares this key.");
			return;
		}
		logger.log("\nDeclared by:");
		logger.table(
			key.referencing_workflows.map((reference) => ({
				Workflow: reference.workflow_name,
				Version: reference.version_id,
			}))
		);
	},
});
