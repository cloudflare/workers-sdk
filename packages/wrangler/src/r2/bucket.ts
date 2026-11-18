import {
	bucketFormatMessage,
	isValidR2BucketName,
	UserError,
} from "@cloudflare/workers-utils";
import { createCommand, createNamespace } from "../core/create-command";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import {
	createdResourceConfig,
	sharedResourceCreationArgs,
} from "../utils/add-created-resource-config";
import { getValidBindingName } from "../utils/getValidBindingName";
import formatLabelledValues from "../utils/render-labelled-values";
import { LOCATION_CHOICES } from "./constants";
import {
	createR2Bucket,
	deleteR2Bucket,
	getR2Bucket,
	getR2BucketMetrics,
	listR2Buckets,
	tableFromR2BucketsListResponse,
	updateR2BucketStorageClass,
} from "./helpers/bucket";
import type { R2CreatedBucket } from "./helpers/bucket";

export const r2BucketNamespace = createNamespace({
	metadata: {
		description: "Manage R2 buckets",
		status: "stable",
		owner: "Product: R2",
	},
});

export const r2BucketCreateCommand = createCommand({
	metadata: {
		description: "Create a new R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
	behaviour: {
		supportTemporary: true,
	},
	positionalArgs: ["name"],
	args: {
		name: {
			describe: "The name of the new bucket",
			type: "string",
			demandOption: true,
		},
		location: {
			describe:
				"The optional location hint that determines geographic placement of the R2 bucket. Hints are only honored the first time a bucket name is created",
			choices: LOCATION_CHOICES,
			requiresArg: true,
			type: "string",
		},
		"storage-class": {
			describe: "The default storage class for objects uploaded to this bucket",
			alias: "s",
			requiresArg: false,
			type: "string",
		},
		jurisdiction: {
			describe: "The jurisdiction where the new bucket will be created",
			alias: "J",
			requiresArg: true,
			type: "string",
		},
		...sharedResourceCreationArgs,
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);
		const { name, location, storageClass, jurisdiction } = args;

		if (!isValidR2BucketName(name)) {
			throw new UserError(
				`The bucket name "${name}" is invalid. ${bucketFormatMessage}`,
				{ telemetryMessage: "r2 bucket create invalid bucket name" }
			);
		}

		if (jurisdiction && location) {
			throw new UserError(
				"Provide either a jurisdiction or location hint - not both.",
				{
					telemetryMessage:
						"r2 bucket create conflicting jurisdiction and location",
				}
			);
		}

		let fullBucketName = `${name}`;
		if (jurisdiction !== undefined) {
			fullBucketName += ` (${jurisdiction})`;
		}

		logger.log(`Creating bucket '${fullBucketName}'...`);
		const created = await createR2Bucket(
			config,
			accountId,
			name,
			location,
			jurisdiction,
			storageClass
		);
		const { message, locationWarning } = formatR2BucketCreatedMessage(
			fullBucketName,
			location,
			created,
			storageClass
		);
		logger.log(message);
		if (locationWarning !== undefined) {
			logger.warn(locationWarning);
		}

		await createdResourceConfig(
			"r2_buckets",
			(bindingName) => ({
				bucket_name: args.name,
				binding: getValidBindingName(bindingName ?? args.name, "r2"),
			}),
			config.configPath,
			args.env,
			args
		);

		metrics.sendMetricsEvent("create r2 bucket", {
			sendMetrics: config.send_metrics,
		});
	},
});

const R2_DATA_LOCATION_DOCS =
	"https://developers.cloudflare.com/r2/reference/data-location/";

/**
 * Build the success line for `r2 bucket create` from the bucket R2 returned.
 *
 * The create API's `location` is the placement that was used. A requested hint
 * is mentioned only when that location matches. When R2 returns a different
 * location, the message reports it and `locationWarning` explains that the hint
 * was ignored (for example, because the bucket name was reused).
 *
 * @param fullBucketName - Bucket name, including a jurisdiction suffix when set.
 * @param requestedLocation - Location hint from `--location`, when one was passed.
 * @param created - Create-bucket API result.
 * @param storageClass - Storage class from `--storage-class`, when one was passed.
 * @returns The success message, and a warning when the hint was not applied.
 */
function formatR2BucketCreatedMessage(
	fullBucketName: string,
	requestedLocation: string | undefined,
	created: R2CreatedBucket,
	storageClass: string | undefined
): { message: string; locationWarning?: string } {
	const storageClassLabel = storageClass ?? "Standard";
	const actualLocation = created.location;
	let locationClause = "";
	let locationWarning: string | undefined;

	if (
		requestedLocation !== undefined &&
		actualLocation !== undefined &&
		locationsMatch(actualLocation, requestedLocation)
	) {
		locationClause = ` location hint ${actualLocation} and`;
	} else if (requestedLocation !== undefined && actualLocation !== undefined) {
		locationClause = ` location ${actualLocation} and`;
		locationWarning = [
			`The location hint "${requestedLocation}" was not applied. The bucket location is "${actualLocation}".`,
			"Location hints are only honored the first time a bucket name is created. If you delete and recreate a bucket with the same name, the original bucket's location will be used.",
			`See ${R2_DATA_LOCATION_DOCS}`,
		].join("\n");
	}

	return {
		message: `✅ Created bucket '${fullBucketName}' with${locationClause} default storage class of ${storageClassLabel}.`,
		locationWarning,
	};
}

/**
 * Compare an R2 location with a requested hint.
 *
 * The create API documents lowercase hints, and bucket info can report the
 * same location in uppercase. Matching ignores that case difference.
 *
 * @param actualLocation - Location from the create response.
 * @param requestedLocation - Location hint from `--location`.
 * @returns Whether the two name the same location.
 */
function locationsMatch(
	actualLocation: string,
	requestedLocation: string
): boolean {
	return actualLocation.toLowerCase() === requestedLocation.toLowerCase();
}

export const r2BucketUpdateNamespace = createNamespace({
	metadata: {
		description: "Update bucket state",
		status: "stable",
		owner: "Product: R2",
	},
});

export const r2BucketUpdateStorageClassCommand = createCommand({
	metadata: {
		description: "Update the default storage class of an existing R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
	behaviour: {
		supportTemporary: true,
	},
	positionalArgs: ["name"],
	args: {
		name: {
			describe: "The name of the existing bucket",
			type: "string",
			demandOption: true,
		},
		jurisdiction: {
			describe: "The jurisdiction of the bucket to be updated",
			alias: "J",
			requiresArg: true,
			type: "string",
		},
		"storage-class": {
			describe: "The new default storage class for this bucket",
			alias: "s",
			demandOption: true,
			requiresArg: true,
			type: "string",
		},
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		let fullBucketName = `${args.name}`;
		if (args.jurisdiction !== undefined) {
			fullBucketName += ` (${args.jurisdiction})`;
		}
		logger.log(
			`Updating bucket ${fullBucketName} to ${args.storageClass} default storage class.`
		);
		await updateR2BucketStorageClass(
			config,
			accountId,
			args.name,
			args.storageClass,
			args.jurisdiction
		);
		logger.log(
			`Updated bucket ${fullBucketName} to ${args.storageClass} default storage class.`
		);
	},
});

export const r2BucketListCommand = createCommand({
	metadata: {
		description: "List R2 buckets",
		status: "stable",
		owner: "Product: R2",
	},
	behaviour: {
		supportTemporary: true,
		// This is an account-level command and does not require a valid project config.
		// Keeping config parsing out of the critical path avoids blocking users who are
		// using `wrangler r2 bucket list` to debug/fix an invalid wrangler.jsonc/toml.
		provideConfig: false,
	},
	args: {
		jurisdiction: {
			describe: "The jurisdiction to list",
			alias: "J",
			requiresArg: true,
			type: "string",
		},
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		logger.log(`Listing buckets...`);

		const buckets = await listR2Buckets(config, accountId, args.jurisdiction);
		const tableOutput = tableFromR2BucketsListResponse(buckets);
		logger.log(tableOutput.map((x) => formatLabelledValues(x)).join("\n\n"));
	},
});

export const r2BucketInfoCommand = createCommand({
	metadata: {
		description: "Get information about an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe: "The name of the bucket to retrieve info for",
			type: "string",
			demandOption: true,
		},
		jurisdiction: {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		},
		json: {
			describe: "Return the bucket information as JSON",
			type: "boolean",
			default: false,
		},
	},
	behaviour: {
		supportTemporary: true,
		printBanner: (args) => !args.json,
	},

	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		if (!args.json) {
			logger.log(`Getting info for '${args.bucket}'...`);
		}

		const bucketInfo = await getR2Bucket(
			config,
			accountId,
			args.bucket,
			args.jurisdiction
		);

		const bucketMetrics = await getR2BucketMetrics(
			config,
			accountId,
			args.bucket,
			args.jurisdiction
		);

		const output = {
			name: bucketInfo.name,
			created: bucketInfo.creation_date,
			location: bucketInfo.location || "(unknown)",
			default_storage_class: bucketInfo.storage_class || "(unknown)",
			object_count: bucketMetrics.objectCount.toLocaleString(),
			bucket_size: bucketMetrics.totalSize,
		};

		if (args.json) {
			logger.json(output);
		} else {
			logger.log(formatLabelledValues(output));
		}
	},
});

export const r2BucketDeleteCommand = createCommand({
	metadata: {
		description: "Delete an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
	behaviour: {
		supportTemporary: true,
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe: "The name of the bucket to delete",
			type: "string",
			demandOption: true,
		},
		jurisdiction: {
			describe: "The jurisdiction where the bucket exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		},
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);

		let fullBucketName = `${args.bucket}`;
		if (args.jurisdiction !== undefined) {
			fullBucketName += ` (${args.jurisdiction})`;
		}
		logger.log(`Deleting bucket ${fullBucketName}.`);
		await deleteR2Bucket(config, accountId, args.bucket, args.jurisdiction);
		logger.log(`Deleted bucket ${fullBucketName}.`);
		metrics.sendMetricsEvent("delete r2 bucket", {
			sendMetrics: config.send_metrics,
		});
	},
});
