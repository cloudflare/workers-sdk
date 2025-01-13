import { fetchResult } from "../../cfetch";
import { withConfig } from "../../config";
import { confirm } from "../../dialogs";
import { UserError } from "../../errors";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { printWranglerBanner } from "../../wrangler-banner";
import { Database } from "../options";
import { getDatabaseByNameOrBinding } from "../utils";
import { getBookmarkIdFromTimestamp, throwIfDatabaseIsAlpha } from "./utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";
import type { RestoreBookmarkResponse } from "./types";

export function RestoreOptions(yargs: CommonYargsArgv) {
	return Database(yargs)
		.option("bookmark", {
			describe: "Bookmark to use for time travel",
			type: "string",
		})
		.option("timestamp", {
			describe:
				"accepts a Unix (seconds from epoch) or RFC3339 timestamp (e.g. 2023-07-13T08:46:42.228Z) to retrieve a bookmark for",
			type: "string",
		})
		.option("json", {
			describe: "return output as clean JSON",
			type: "boolean",
			default: false,
		})
		.check(function (argv) {
			if (
				(argv.timestamp && !argv.bookmark) ||
				(!argv.timestamp && argv.bookmark)
			) {
				return true;
			} else if (argv.timestamp && argv.bookmark) {
				throw new UserError(
					"Provide either a timestamp, or a bookmark - not both."
				);
			} else {
				throw new UserError("Provide either a timestamp or a bookmark");
			}
		});
}

type HandlerOptions = StrictYargsOptionsToInterface<typeof RestoreOptions>;

export const RestoreHandler = withConfig<HandlerOptions>(
	async ({ database, config, json, timestamp, bookmark }): Promise<void> => {
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
			await printWranglerBanner();
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
	}
);

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
