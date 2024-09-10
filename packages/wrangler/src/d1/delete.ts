import { fetchResult } from "../cfetch";
import { defineCommand } from "../core";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { requireAuth } from "../user";
import * as SharedArgs from "./options";
import { getDatabaseByNameOrBinding } from "./utils";
import type { Database } from "./types";

defineCommand({
	command: "wrangler d1 delete",

	metadata: {
		description: "Delete D1 database",
		status: "stable",
		owner: "Product: D1",
	},

	positionalArgs: ["name"],
	args: {
		...SharedArgs.Name,
		"skip-confirmation": {
			describe: "Skip confirmation",
			type: "boolean",
			alias: "y",
			default: false,
		},
	},

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

		await fetchResult(`/accounts/${accountId}/d1/database/${db.uuid}`, {
			method: "DELETE",
		});

		logger.log(`Deleted '${name}' successfully.`);
	},
});
