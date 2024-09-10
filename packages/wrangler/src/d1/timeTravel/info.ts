import { printWranglerBanner } from "../..";
import { defineCommand } from "../../core";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import * as SharedArgs from "../options";
import { getDatabaseByNameOrBinding } from "../utils";
import { getBookmarkIdFromTimestamp, throwIfDatabaseIsAlpha } from "./utils";

defineCommand({
	command: "wrangler d1 time-travel info",

	metadata: {
		description:
			"Retrieve information about a database at a specific point-in-time using Time Travel",
		status: "stable",
		owner: "Product: D1",
	},

	positionalArgs: ["database"],
	args: {
		...SharedArgs.Database,
		timestamp: {
			describe:
				"accepts a Unix (seconds from epoch) or RFC3339 timestamp (e.g. 2023-07-13T08:46:42.228Z) to retrieve a bookmark for",
			type: "string",
		},
		json: {
			describe: "return output as clean JSON",
			type: "boolean",
			default: false,
		},
	},

	behaviour: {
		printBanner: false,
	},

	async handler({ database, json, timestamp }, { config }) {
		// bookmark
		const accountId = await requireAuth(config);
		const db = await getDatabaseByNameOrBinding(config, accountId, database);
		await throwIfDatabaseIsAlpha(accountId, db.uuid);
		const result = await getBookmarkIdFromTimestamp(
			accountId,
			db.uuid,
			timestamp
		);
		if (json) {
			logger.log(JSON.stringify(result, null, 2));
		} else {
			await printWranglerBanner();
			logger.log("🚧 Time Traveling...");
			logger.log(
				timestamp
					? `⚠️ Timestamp '${timestamp}' corresponds with bookmark '${result.bookmark}'`
					: `⚠️ The current bookmark is '${result.bookmark}'`
			);
			logger.log(
				`⚡️ To restore to this specific bookmark, run:\n \`wrangler d1 time-travel restore ${database} --bookmark=${result.bookmark}\``
			);
		}
	},
});
