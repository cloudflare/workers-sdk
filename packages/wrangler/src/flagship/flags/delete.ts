import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { runBulk } from "../bulk";
import { deleteFlag } from "../client";
import { jsonFriendlyError } from "../shared";

export const flagshipFlagsDeleteCommand = createCommand({
	metadata: {
		description: "Delete a feature flag from a Flagship app",
		status: "open beta",
		owner: "Product: Flagship",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		"app-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the app",
		},
		key: {
			type: "string",
			array: true,
			demandOption: true,
			description: "One or more flag keys to delete",
		},
		force: {
			type: "boolean",
			alias: "y",
			default: false,
			description: "Skip the confirmation prompt",
		},
		json: {
			type: "boolean",
			default: false,
			description: "Return output as JSON",
		},
	},
	positionalArgs: ["app-id", "key"],
	async handler(args, { config, confirm }) {
		const { appId, key: keys } = args;
		if (args.json && !args.force) {
			throw jsonFriendlyError(
				"Pass --force to skip the confirmation prompt when using --json.",
				"flagship delete json requires force"
			);
		}
		if (!args.force) {
			const label = keys.length === 1 ? keys[0] : keys.join(", ");
			const confirmed = await confirm(
				`Are you sure you want to delete the flag${keys.length === 1 ? "" : "s"} '${label}'?`
			);
			if (!confirmed) {
				logger.log("Aborting delete.");
				return;
			}
		}
		await runBulk(keys, (key) => deleteFlag(config, appId, key), {
			json: args.json,
			onSuccess: (_flag, key) => logger.log(`✅ Deleted flag '${key}'`),
		});
	},
});
