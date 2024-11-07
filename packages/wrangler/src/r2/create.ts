import { printWranglerBanner } from "..";
import { readConfig } from "../config";
import { UserError } from "../errors";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { LOCATION_CHOICES } from "./constants";
import { createR2Bucket, isValidR2BucketName } from "./helpers";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function Options(yargs: CommonYargsArgv) {
	return yargs
		.positional("name", {
			describe: "The name of the new bucket",
			type: "string",
			demandOption: true,
		})
		.option("location", {
			describe:
				"The optional location hint that determines geographic placement of the R2 bucket",
			choices: LOCATION_CHOICES,
			requiresArg: true,
			type: "string",
		})
		.option("storage-class", {
			describe: "The default storage class for objects uploaded to this bucket",
			alias: "s",
			requiresArg: false,
			type: "string",
		})
		.option("jurisdiction", {
			describe: "The jurisdiction where the new bucket will be created",
			alias: "J",
			requiresArg: true,
			type: "string",
		});
}

type HandlerOptions = StrictYargsOptionsToInterface<typeof Options>;
export async function Handler(args: HandlerOptions) {
	await printWranglerBanner();
	const config = readConfig(args.config, args);
	const accountId = await requireAuth(config);
	const { name, location, storageClass, jurisdiction } = args;

	if (!isValidR2BucketName(name)) {
		throw new UserError(
			`The bucket name "${name}" is invalid. Bucket names can only have alphanumeric and - characters.`
		);
	}

	if (jurisdiction && location) {
		throw new UserError(
			"Provide either a jurisdiction or location hint - not both."
		);
	}

	let fullBucketName = `${name}`;
	if (jurisdiction !== undefined) {
		fullBucketName += ` (${jurisdiction})`;
	}

	logger.log(`Creating bucket '${fullBucketName}'...`);
	await createR2Bucket(accountId, name, location, jurisdiction, storageClass);
	logger.log(
		`✅ Created bucket '${fullBucketName}' with${
			location ? ` location hint ${location} and` : ``
		} default storage class of ${storageClass ? storageClass : `Standard`}.`
	);
	await metrics.sendMetricsEvent("create r2 bucket", {
		sendMetrics: config.send_metrics,
	});
}
