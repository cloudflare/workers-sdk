import { fetchResult } from "../../../cfetch";
import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import { jsonWorkflowArgs } from "../../utils";
import { concurrencyKeyMetadata, concurrencyKeysPath } from "./shared";
import type { ConcurrencyKey } from "../../types";

export const workflowsConcurrencyCreateCommand = createCommand({
	metadata: {
		...concurrencyKeyMetadata,
		description:
			"Create a concurrency key that limits how many steps can hold it at once",
	},
	args: {
		...jsonWorkflowArgs,
		name: {
			describe: "Name of the key, referenced by steps via `concurrency`",
			type: "string",
			demandOption: true,
		},
		limit: {
			describe: "Maximum number of steps that can hold the key at once",
			type: "number",
			demandOption: true,
		},
	},
	positionalArgs: ["name"],
	behaviour: {
		printBanner: (args) => !args.json,
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);
		const key = await fetchResult<ConcurrencyKey>(
			config,
			concurrencyKeysPath(accountId),
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: args.name, limit: args.limit }),
			}
		);

		if (args.json) {
			logger.json(key);
			return;
		}
		logger.log(
			`✅ Created concurrency key "${key.name}" (${key.id}) with a limit of ${key.limit}.`
		);
	},
});
