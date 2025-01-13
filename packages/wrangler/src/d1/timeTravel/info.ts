import { withConfig } from "../../config";
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

export function InfoOptions(yargs: CommonYargsArgv) {
	return Database(yargs)
		.option("timestamp", {
			describe:
				"accepts a Unix (seconds from epoch) or RFC3339 timestamp (e.g. 2023-07-13T08:46:42.228Z) to retrieve a bookmark for",
			type: "string",
		})
		.option("json", {
			describe: "return output as clean JSON",
			type: "boolean",
			default: false,
		});
}

type HandlerOptions = StrictYargsOptionsToInterface<typeof InfoOptions>;

export const InfoHandler = withConfig<HandlerOptions>(
	async ({ database, config, json, timestamp }): Promise<void> => {
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
			logger.log(`⚡️ To restore to this specific bookmark, run:\n \`wrangler d1 time-travel restore ${database} --bookmark=${result.bookmark}\`
      `);
		}
	}
);
