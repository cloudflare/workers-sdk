import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { runBulk } from "../bulk";
import { deleteApp } from "../client";
import { jsonFriendlyError } from "../shared";

export const flagshipAppsDeleteCommand = createCommand({
	metadata: {
		description: "Delete a Flagship app",
		status: "open beta",
		owner: "Product: Flagship",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		"app-id": {
			type: "string",
			array: true,
			demandOption: true,
			description: "One or more app IDs to delete",
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
	positionalArgs: ["app-id"],
	async handler({ appId: appIds, force, json }, { config, confirm }) {
		if (json && !force) {
			throw jsonFriendlyError(
				"Pass --force to skip the confirmation prompt when using --json.",
				"flagship delete json requires force"
			);
		}
		if (!force) {
			const label = appIds.length === 1 ? appIds[0] : appIds.join(", ");
			const confirmed = await confirm(
				`Are you sure you want to delete the Flagship app${appIds.length === 1 ? "" : "s"} '${label}'? This also deletes all of ${appIds.length === 1 ? "its" : "their"} flags.`
			);
			if (!confirmed) {
				logger.log("Aborting delete.");
				return;
			}
		}
		await runBulk(appIds, (id) => deleteApp(config, id), {
			json,
			onSuccess: (_app, id) => logger.log(`✅ Deleted Flagship app '${id}'`),
		});
	},
});
