import { defineCommand, defineNamespace } from "../core";
import { UserError } from "../errors";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { getValidBindingName } from "../utils/getValidBindingName";
import { LOCATION_CHOICES } from "./constants";
import {
	createR2Bucket,
	deleteR2Bucket,
	isValidR2BucketName,
	listR2Buckets,
	updateR2BucketStorageClass,
} from "./helpers";

defineNamespace({
	command: "wrangler r2 bucket",
	metadata: {
		description: "Manage R2 buckets",
		status: "stable",
		owner: "Product: R2",
	},
});

defineCommand({
	command: "wrangler r2 bucket create",
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
			} default storage class of ${storageClass ? storageClass : `Standard`}.\n\n` +
				"Configure your Worker to write objects to this bucket:\n\n" +
				"[[r2_buckets]]\n" +
				`bucket_name = "${args.name}"\n` +
				`binding = "${getValidBindingName(args.name, "r2")}"`
		);

		await metrics.sendMetricsEvent("create r2 bucket", {
			sendMetrics: config.send_metrics,
		});
	},
});

defineNamespace({
	command: "wrangler r2 bucket update",
	metadata: {
		description: "Update bucket state",
		status: "stable",
		owner: "Product: R2",
	},
});

defineCommand({
	command: "wrangler r2 bucket update storage-class",
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

defineCommand({
	command: "wrangler r2 bucket list",
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

		logger.log(
			JSON.stringify(await listR2Buckets(accountId, args.jurisdiction), null, 2)
		);
		await metrics.sendMetricsEvent("list r2 buckets", {
			sendMetrics: config.send_metrics,
		});
	},
});

defineCommand({
	command: "wrangler r2 bucket delete",
	metadata: {
		description: "Delete an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
	positionalArgs: ["name"],
	args: {
		name: {
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

		let fullBucketName = `${args.name}`;
		if (args.jurisdiction !== undefined) {
			fullBucketName += ` (${args.jurisdiction})`;
		}
		logger.log(`Deleting bucket ${fullBucketName}.`);
		await deleteR2Bucket(accountId, args.name, args.jurisdiction);
		logger.log(`Deleted bucket ${fullBucketName}.`);
		await metrics.sendMetricsEvent("delete r2 bucket", {
			sendMetrics: config.send_metrics,
		});
	},
});
