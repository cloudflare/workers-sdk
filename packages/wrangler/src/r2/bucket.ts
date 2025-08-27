import dedent from "ts-dedent";
import { updateConfigFile } from "../config";
import { createCommand, createNamespace } from "../core/create-command";
import { UserError } from "../errors";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { getValidBindingName } from "../utils/getValidBindingName";
import formatLabelledValues from "../utils/render-labelled-values";
import { LOCATION_CHOICES } from "./constants";
import {
	bucketFormatMessage,
	createR2Bucket,
	deleteR2Bucket,
	getR2Bucket,
	getR2BucketMetrics,
	isValidR2BucketName,
	listR2Buckets,
	tablefromR2BucketsListResponse,
	updateR2BucketStorageClass,
} from "./helpers";

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
	positionalArgs: ["name"],
	args: {
		name: {
			describe: "The name of the new bucket",
			type: "string",
			demandOption: true,
		},
		location: {
			describe:
				"The optional location hint that determines geographic placement of the R2 bucket",
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
	},
	async handler(args, { config }) {
		const accountId = await requireAuth(config);
		const { name, location, storageClass, jurisdiction } = args;

		if (!isValidR2BucketName(name)) {
			throw new UserError(
				`The bucket name "${name}" is invalid. ${bucketFormatMessage}`
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
		await createR2Bucket(
			config,
			accountId,
			name,
			location,
			jurisdiction,
			storageClass
		);
		logger.log(dedent`
			✅ Created bucket '${fullBucketName}' with${
				location ? ` location hint ${location} and` : ``
			} default storage class of ${storageClass ? storageClass : `Standard`}.`);

		await updateConfigFile(
			(bindingName) => ({
				r2_buckets: [
					{
						bucket_name: args.name,
						binding: getValidBindingName(bindingName ?? args.name, "r2"),
					},
				],
			}),
			config.configPath,
			args.env
		);

		metrics.sendMetricsEvent("create r2 bucket", {
			sendMetrics: config.send_metrics,
		});
	},
});

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
		const tableOutput = tablefromR2BucketsListResponse(buckets);
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
