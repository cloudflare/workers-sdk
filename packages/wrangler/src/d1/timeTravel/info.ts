import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { getDatabaseByNameOrBinding } from "../utils";
import { getBookmarkIdFromTimestamp, throwIfDatabaseIsAlpha } from "./utils";

export const d1TimeTravelInfoCommand = createCommand({
	metadata: {
		description:
			"Retrieve information about a database at a specific point-in-time using Time Travel",
		status: "stable",
		owner: "Product: D1",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		database: {
			type: "string",
			demandOption: true,
			description: "The name or binding of the DB",
		},
		timestamp: {
			type: "string",
			description:
				"Accepts a Unix (seconds from epoch) or RFC3339 timestamp (e.g. 2023-07-13T08:46:42.228Z) to retrieve a bookmark for",
		},
		json: {
			type: "boolean",
			description: "Return output as clean JSON",
			default: false,
		},
	},
	positionalArgs: ["database"],
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
			logger.log("🚧 Time Traveling...");
			logger.log(
				timestamp
					? `⚠️ Timestamp '${timestamp}' corresponds with bookmark '${result.bookmark}'`
					: `⚠️ The current bookmark is '${result.bookmark}'`
			);
			logger.log(`⚡️ To restore to this specific bookmark, run:\n \`wrangler d1 time-travel restore ${database} --bookmark=${result.bookmark}\`
      `);
		}
	},
});
