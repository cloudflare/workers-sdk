import { fetchResult } from "../../cfetch";
import { createCommand } from "../../core/create-command";
import { confirm } from "../../dialogs";
import { UserError } from "../../errors";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { getDatabaseByNameOrBinding } from "../utils";
import { getBookmarkIdFromTimestamp, throwIfDatabaseIsAlpha } from "./utils";
import type { RestoreBookmarkResponse } from "./types";

export const d1TimeTravelRestoreCommand = createCommand({
	metadata: {
		description: "Restore a database back to a specific point-in-time",
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
		bookmark: {
			type: "string",
			description: "Bookmark to use for time travel",
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
	validateArgs(args) {
		if (args.timestamp && args.bookmark) {
			throw new UserError(
				"Provide either a timestamp, or a bookmark - not both."
			);
		} else if (!args.timestamp && !args.bookmark) {
			throw new UserError("Provide either a timestamp or a bookmark");
		}
	},
	async handler({ database, json, timestamp, bookmark }, { config }) {
		// bookmark
		const accountId = await requireAuth(config);
		const db = await getDatabaseByNameOrBinding(config, accountId, database);
		await throwIfDatabaseIsAlpha(accountId, db.uuid);
		const searchParams = new URLSearchParams();

		if (timestamp) {
			const bookmarkResult = await getBookmarkIdFromTimestamp(
				accountId,
				db.uuid,
				timestamp
			);

			searchParams.set("bookmark", bookmarkResult.bookmark);
		} else if (bookmark) {
			searchParams.set("bookmark", bookmark);
		}

		if (json) {
			const result = await handleRestore(accountId, db.uuid, searchParams);
			logger.log(JSON.stringify(result, null, 2));
		} else {
			logger.log(`🚧 Restoring database ${database} from bookmark ${searchParams.get(
				"bookmark"
			)}
			`);
			logger.log(`⚠️ This will overwrite all data in database ${database}. \nIn-flight queries and transactions will be cancelled.
			`);
			if (await confirm("OK to proceed (y/N)", { defaultValue: false })) {
				logger.log("⚡️ Time travel in progress...");
				const result = await handleRestore(accountId, db.uuid, searchParams);
				logger.log(`✅ Database ${database} restored back to bookmark ${result.bookmark}
				`);
				logger.log(
					`↩️ To undo this operation, you can restore to the previous bookmark: ${result.previous_bookmark}`
				);
			}
		}
	},
});

const handleRestore = async (
	accountId: string,
	databaseId: string,
	searchParams: URLSearchParams
) => {
	return await fetchResult<RestoreBookmarkResponse>(
		`/accounts/${accountId}/d1/database/${databaseId}/time_travel/restore?${searchParams.toString()}`,
		{
			headers: {
				"Content-Type": "application/json",
			},
			method: "POST",
		}
	);
};
