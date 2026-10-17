import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { jsonWorkflowArgs } from "../../utils";
import {
	concurrencyKeyArg,
	concurrencyKeyMetadata,
	concurrencyLocalArgs,
	getConcurrencyKeysClient,
} from "./shared";

export const workflowsConcurrencyUpdateCommand = createCommand({
	metadata: {
		...concurrencyKeyMetadata,
		description: "Change the limit of a concurrency key",
	},
	args: {
		...concurrencyLocalArgs,
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
		const client = await getConcurrencyKeysClient(config, args);
		const key = await client.update(
			await client.resolveId(args.key),
			args.limit
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
