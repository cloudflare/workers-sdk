import { readConfig } from "../config";
import { logger } from "../logger";
import { printWranglerBanner } from "../update-check";
import { requireAuth } from "../user";
import formatLabelledValues from "../utils/render-labelled-values";
import { getR2Bucket, getR2BucketMetrics } from "./helpers";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function InfoOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("bucket", {
			describe: "The name of the R2 bucket to get information about",
			type: "string",
			demandOption: true,
		})
		.option("jurisdiction", {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		});
}

export async function InfoHandler(
	args: StrictYargsOptionsToInterface<typeof InfoOptions>
) {
	await printWranglerBanner();
	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);

	const { bucket, jurisdiction } = args;

	logger.log(`Getting info for '${bucket}'...`);
	const bucketInfo = await getR2Bucket(accountId, bucket, jurisdiction);
	const metrics = await getR2BucketMetrics(accountId, bucket, jurisdiction);

	const output = {
		name: bucketInfo.name,
		created: bucketInfo.creation_date,
		location: bucketInfo.location || "(unknown)",
		default_storage_class: bucketInfo.storage_class || "(unknown)",
		object_count: metrics.objectCount.toLocaleString(),
		bucket_size: metrics.totalSize,
	};

	logger.log(formatLabelledValues(output));
}
