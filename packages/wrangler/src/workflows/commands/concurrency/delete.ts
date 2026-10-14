import { CommandLineArgsError } from "@cloudflare/workers-utils";
import { createCommand } from "../../../core/create-command";
import { confirm } from "../../../dialogs";
import { logger } from "../../../logger";
import { jsonWorkflowArgs } from "../../utils";
import {
	concurrencyKeyArg,
	concurrencyKeyMetadata,
	concurrencyLocalArgs,
	getConcurrencyKeysClient,
} from "./shared";

export const workflowsConcurrencyDeleteCommand = createCommand({
	metadata: {
		...concurrencyKeyMetadata,
		description:
			"Delete a concurrency key; steps that reference it then run without its limit",
	},
	args: {
		...concurrencyLocalArgs,
		...jsonWorkflowArgs,
		key: concurrencyKeyArg,
		force: {
			describe: "Skip confirmation",
			type: "boolean",
			alias: "y",
			default: false,
		},
	},
	positionalArgs: ["key"],
	behaviour: {
		printBanner: (args) => !args.json,
	},
	validateArgs(args) {
		if (args.json && !args.force) {
			throw new CommandLineArgsError(
				"Deleting a concurrency key with --json requires --force to skip confirmation.",
				{ telemetryMessage: "workflows concurrency delete json missing force" }
			);
		}
	},
	async handler(args, { config }) {
		const client = await getConcurrencyKeysClient(config, args);
		const key = await client.get(await client.resolveId(args.key));
		if (
			!args.force &&
			!(await confirm(
				`Are you sure you want to delete the concurrency key "${key.name}" (${key.id})? Steps that reference it will run without its limit.`,
				{ defaultValue: false, fallbackValue: false }
			))
		) {
			logger.log("Delete cancelled.");
			return;
		}
		await client.delete(key.id);

		if (args.json) {
			logger.json({ id: key.id, name: key.name, deleted: true });
			return;
		}
		logger.log(`✅ Deleted concurrency key "${key.name}" (${key.id}).`);
	},
});
