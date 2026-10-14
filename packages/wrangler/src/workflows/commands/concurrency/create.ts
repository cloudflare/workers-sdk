import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { jsonWorkflowArgs } from "../../utils";
import {
	concurrencyKeyMetadata,
	concurrencyLocalArgs,
	getConcurrencyKeysClient,
} from "./shared";

export const workflowsConcurrencyCreateCommand = createCommand({
	metadata: {
		...concurrencyKeyMetadata,
		description:
			"Create a concurrency key that limits how many steps can hold it at once",
	},
	args: {
		...concurrencyLocalArgs,
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
		const client = await getConcurrencyKeysClient(config, args);
		const key = await client.create(args.name, args.limit);

		if (args.json) {
			logger.json(key);
			return;
		}
		logger.log(
			`✅ Created concurrency key "${key.name}" (${key.id}) with a limit of ${key.limit}${client.local ? " in the local dev session" : ""}.`
		);
	},
});
