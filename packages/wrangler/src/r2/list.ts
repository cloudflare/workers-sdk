import { readConfig } from "../config";
import { logger } from "../logger";
import { printWranglerBanner } from "../update-check";
import { requireAuth } from "../user";
import formatLabelledValues from "../utils/render-labelled-values";
import { listR2Buckets, tablefromR2BucketsListResponse } from "./helpers";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function ListOptions(yargs: CommonYargsArgv) {
	return yargs.option("jurisdiction", {
		describe: "The jurisdiction to list",
		alias: "J",
		requiresArg: true,
		type: "string",
	});
}

export async function ListHandler(
	args: StrictYargsOptionsToInterface<typeof ListOptions>
) {
	await printWranglerBanner();
	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);

	const { jurisdiction } = args;

	logger.log(`Listing buckets...`);

	const buckets = await listR2Buckets(accountId, jurisdiction);
	const tableOutput = tablefromR2BucketsListResponse(buckets);
	logger.log(tableOutput.map((x) => formatLabelledValues(x)).join("\n\n"));
}
