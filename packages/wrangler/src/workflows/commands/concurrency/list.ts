import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { jsonWorkflowArgs } from "../../utils";
import {
	concurrencyKeyMetadata,
	concurrencyLocalArgs,
	getConcurrencyKeysClient,
} from "./shared";
import type { ConcurrencyKey } from "../../types";

export const workflowsConcurrencyListCommand = createCommand({
	metadata: {
		...concurrencyKeyMetadata,
		description: "List the concurrency keys in the account",
	},
	args: {
		...concurrencyLocalArgs,
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
		const client = await getConcurrencyKeysClient(config, args);
		const keys = await client.list(args.page, args.perPage);

		if (args.json) {
			logger.json(keys);
			return;
		}
		const scope = client.local ? "the local dev session" : "this account";
		if (keys.length === 0) {
			logger.warn(
				args.page === 1
					? `There are no concurrency keys in ${scope}`
					: `No concurrency keys found on page ${args.page}.`
			);
			return;
		}
		const created = (key: ConcurrencyKey) =>
			new Date(key.created_on).toLocaleString();
		if (client.local) {
			logger.table(
				keys.map((key) => ({
					Name: key.name,
					Limit: String(key.limit),
					Holding: String(key.usage?.holding ?? 0),
					Waiting: String(key.usage?.waiting ?? 0),
					ID: key.id,
					Created: created(key),
				}))
			);
			return;
		}
		logger.table(
			keys.map((key) => ({
				Name: key.name,
				Limit: String(key.limit),
				ID: key.id,
				Created: created(key),
			}))
		);
	},
});
