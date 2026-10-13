import { fetchResult } from "../../../cfetch";
import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import { jsonWorkflowArgs } from "../../utils";
import {
	concurrencyKeyArg,
	concurrencyKeyMetadata,
	concurrencyKeysPath,
	resolveConcurrencyKeyId,
} from "./shared";
import type { ConcurrencyKey } from "../../types";

export const workflowsConcurrencyUpdateCommand = createCommand({
	metadata: {
		...concurrencyKeyMetadata,
		description: "Change the limit of a concurrency key",
	},
	args: {
		...jsonWorkflowArgs,
		key: concurrencyKeyArg,
		limit: {
			describe: "New maximum number of steps that can hold the key at once",
			type: "number",
			demandOption: true,
		},
	},
	positionalArgs: ["key"],
	behaviour: {
		printBanner: (args) => !args.json,
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);
		const keyId = await resolveConcurrencyKeyId(config, accountId, args.key);
		const key = await fetchResult<ConcurrencyKey>(
			config,
			concurrencyKeysPath(accountId, keyId),
			{
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ limit: args.limit }),
			}
		);

		if (args.json) {
			logger.json(key);
			return;
		}
		logger.log(
			`✅ Updated concurrency key "${key.name}" to a limit of ${key.limit}.`
		);
	},
});
