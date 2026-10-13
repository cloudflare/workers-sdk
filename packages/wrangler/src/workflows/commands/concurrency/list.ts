import { fetchResult } from "../../../cfetch";
import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import { jsonWorkflowArgs } from "../../utils";
import { concurrencyKeyMetadata, concurrencyKeysPath } from "./shared";
import type { ConcurrencyKey } from "../../types";

export const workflowsConcurrencyListCommand = createCommand({
	metadata: {
		...concurrencyKeyMetadata,
		description: "List the concurrency keys in the account",
	},
	args: {
		...jsonWorkflowArgs,
		page: {
			describe: "Page of keys to show",
			type: "number",
			default: 1,
		},
		"per-page": {
			describe: "Number of keys per page (1-100)",
			type: "number",
		},
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);
		const params = new URLSearchParams({ page: String(args.page) });
		if (args.perPage !== undefined) {
			params.set("per_page", String(args.perPage));
		}
		const keys = await fetchResult<ConcurrencyKey[]>(
			config,
			concurrencyKeysPath(accountId),
			undefined,
			params
		);

		if (args.json) {
			logger.json(keys);
			return;
		}
		if (keys.length === 0) {
			logger.warn(
				args.page === 1
					? "There are no concurrency keys in this account"
					: `No concurrency keys found on page ${args.page}.`
			);
			return;
		}
		logger.table(
			keys.map((key) => ({
				Name: key.name,
				Limit: String(key.limit),
				ID: key.id,
				Created: new Date(key.created_on).toLocaleString(),
			}))
		);
	},
});
