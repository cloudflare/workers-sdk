import { printWranglerBanner } from "../..";
import { withConfig } from "../../config";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { Database } from "../options";
import { getDatabaseByNameOrBinding } from "../utils";
import {
	checkIfDatabaseIsExperimental,
	getBookmarkIdFromTimestamp,
} from "./utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";

export function InfoOptions(yargs: CommonYargsArgv) {
	return Database(yargs)
		.option("timestamp", {
			describe:
				"timestamp (accepts unix timestamp or ISO strings) to use for time travel",
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
		await checkIfDatabaseIsExperimental(accountId, db.uuid);
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
