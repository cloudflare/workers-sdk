import { fetchResult } from "../cfetch";
import { createCommand } from "../core/create-command";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { getDatabaseByNameOrBinding } from "./utils";
import type { Database } from "./types";

export const d1DeleteCommand = createCommand({
	metadata: {
		description: "Delete D1 database",
		status: "stable",
		owner: "Product: D1",
	},
	behaviour: {
		printBanner: true,
		printResourceLocation: true,
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name or binding of the DB",
		},
		"skip-confirmation": {
			type: "boolean",
			description: "Skip confirmation",
			alias: "y",
			default: false,
		},
	},
	positionalArgs: ["name"],
	async handler({ name, skipConfirmation }, { config }) {
		const accountId = await requireAuth(config);

		const db: Database = await getDatabaseByNameOrBinding(
			config,
			accountId,
			name
		);

		logger.log(`About to delete DB '${name}' (${db.uuid}).`);
		if (!skipConfirmation) {
			const response = await confirm(`Ok to proceed?`);
			if (!response) {
				logger.log(`Not deleting.`);
				return;
			}
		}

		logger.log("Deleting...");

		await fetchResult(config, `/accounts/${accountId}/d1/database/${db.uuid}`, {
			method: "DELETE",
		});

		logger.log(`Deleted '${name}' successfully.`);
	},
});
